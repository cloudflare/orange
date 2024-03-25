import invariant from 'tiny-invariant'
import type { ClientMessage, MessageFromServer } from '~/types/Messages'

export type SignalEvents = {
	error: Event
	connected: Event
	disconnected: Event
	message: MessageEvent<MessageFromServer>
}

export default class Signal {
	#ws: WebSocket | null = null
	#eventTarget = new EventTarget()
	connected: Promise<unknown> | null = null
	disposed = false
	heartBeatInterval = -1
	messageQueue: ClientMessage[] = []
	id: string | null = null
	reconnectBackoff = 0
	reconnectTimeout: number | null = null

	onlineHandler = () => {
		this.connect()
	}

	leaveRoom = () => {
		this.sendMessage({ type: 'userLeft' })
	}

	constructor(private roomName: string) {
		if (typeof window !== 'undefined') {
			window.addEventListener('online', this.onlineHandler)
			window.addEventListener('beforeunload', this.leaveRoom)
		}
	}

	reconnect = () => {
		// bail if reconnect is already scheduled
		if (this.reconnectTimeout !== null) {
			return
		}
		console.log(
			`Reconnecting to WebSocket in ${(this.reconnectBackoff / 1000).toFixed(
				1
			)} seconds...`
		)
		this.reconnectTimeout = window.setTimeout(() => {
			this.reconnectTimeout = null
			this.connect()
		}, this.reconnectBackoff)
		this.reconnectBackoff =
			this.reconnectBackoff === 0 ? 1000 : this.reconnectBackoff * 1.5
	}

	connect() {
		this.connected = new Promise((resolve, reject) => {
			let hostname = window.location.host
			const wss = document.location.protocol === 'http:' ? 'ws://' : 'wss://'
			const params = new URLSearchParams(window.location.search)
			if (this.id) params.set('session_id', this.id)
			this.#ws = new WebSocket(
				wss +
					hostname +
					'/api/room/' +
					this.roomName +
					'/websocket' +
					'?' +
					params
			)
			invariant(this.#ws)
			this.#ws.addEventListener('open', (event) => {
				// reset reconnect backoff when connection is successful
				this.reconnectBackoff = 0
				this.#eventTarget.dispatchEvent(new CustomEvent('connected'))
				this.flushQueue()
				resolve(event)
			})
			this.#ws.addEventListener('error', (event) => {
				console.log('WebSocket error')
				clearInterval(this.heartBeatInterval)
				this.#eventTarget.dispatchEvent(new CustomEvent('error'))
				this.#eventTarget.dispatchEvent(new CustomEvent('disconnected'))
				reject(event)
				this.connected = null
				if (!this.disposed && navigator.onLine) {
					this.reconnect()
				}
			})
			this.#ws.addEventListener('close', (event) => {
				console.log('WebSocket closed')
				clearInterval(this.heartBeatInterval)
				this.#eventTarget.dispatchEvent(new CustomEvent('error'))
				this.#eventTarget.dispatchEvent(new CustomEvent('disconnected'))
				reject(event)
				this.connected = null
				if (!this.disposed && navigator.onLine) {
					this.reconnect()
				}
			})
			this.addEventListener('message', ({ data }) => {
				if (data.message.type === 'identity') {
					this.id = data.message.id
				}
			})
			setTimeout(
				() => {
					reject(null)
				},
				5000,
				'WebSocket connect timed out'
			)
			this.heartBeatInterval = window.setInterval(() => {
				this.sendMessage({ type: 'heartBeat' })
			}, 10000)
			this.#ws.addEventListener('message', (event) => {
				const newEvent = new CustomEvent('message')
				const data = JSON.parse(event.data)
				Object.assign(newEvent, { data })
				this.#eventTarget.dispatchEvent(newEvent)
			})
		})
		return this.connected.catch(() => clearInterval(this.heartBeatInterval))
	}

	dispose() {
		this.disposed = true
		clearTimeout(this.reconnectTimeout)
		window.removeEventListener('online', this.onlineHandler)
		window.removeEventListener('beforeunload', this.leaveRoom)
		invariant(this.#ws)
		this.leaveRoom()
		this.#ws.close()
	}

	addEventListener<Type extends keyof SignalEvents>(
		type: Type,
		callback: ((event: SignalEvents[Type]) => void) | null,
		options?: AddEventListenerOptions | boolean
	) {
		this.#eventTarget.addEventListener(type, callback as any, options)
	}

	removeEventListener<Type extends keyof SignalEvents>(
		type: Type,
		callback: ((event: SignalEvents[Type]) => void) | null,
		options?: AddEventListenerOptions | boolean
	) {
		this.#eventTarget.removeEventListener(type, callback as any, options)
	}

	flushQueue() {
		for (const message of this.messageQueue) {
			this.sendMessage(message)
		}
		this.messageQueue = []
	}

	async sendMessage<M extends ClientMessage>(message: M) {
		if (this.#ws?.readyState === WebSocket.OPEN) {
			this.#ws.send(JSON.stringify(message))
		} else {
			this.messageQueue.push(message)
		}
	}
}
