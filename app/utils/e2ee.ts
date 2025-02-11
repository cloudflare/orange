import type { PartyTracks } from 'partytracks/client'
import { useEffect, useMemo, useState } from 'react'
import invariant from 'tiny-invariant'
import type useRoom from '~/hooks/useRoom'
import type { ServerMessage } from '~/types/Messages'

type MessagesToE2eeWorker =
	| {
			type: 'userJoined'
			id: string
	  }
	| {
			type: 'userLeft'
			id: string
	  }
	| { type: 'recvMlsMessage'; msg: Uint8Array }
	| { type: 'encryptStream'; in: ReadableStream; out: WritableStream }
	| { type: 'decryptStream'; in: ReadableStream; out: WritableStream }
	| { type: 'initializeAndCreateGroup'; id: string }

type MessagesFromE2eeWorker =
	| {
			type: 'workerReady'
	  }
	| {
			type: 'sendMlsMessage'
			msg: Uint8Array
	  }
	| {
			type: 'newSafetyNumber'
			msg: Uint8Array
	  }

export async function loadWorker(
	handleEvents: (message: MessagesFromE2eeWorker) => void
) {
	// Create a new worker
	const worker = new Worker('/e2ee/worker.js')

	const ready = new Promise<void>((res) => {
		const handler = (event: MessageEvent) => {
			if (event.data.type === 'workerReady') {
				res()
				worker.removeEventListener('message', handler)
			}
		}
		worker.addEventListener('message', handler)
	})

	// Listen for messages from the worker
	worker.onmessage = function (event: MessageEvent<MessagesFromE2eeWorker>) {
		console.log('Received message from worker:', event.data)
		handleEvents(event.data)
	}

	// Error handling
	worker.onerror = function (error) {
		console.error('Worker error:', error.message)
	}

	await ready

	async function safePostMessage(message: MessagesToE2eeWorker): Promise<void>
	async function safePostMessage(
		message: MessagesToE2eeWorker,
		transfer: Transferable[]
	): Promise<void>
	async function safePostMessage(
		message: MessagesToE2eeWorker,
		transfer?: Transferable[]
	): Promise<void> {
		if (transfer) {
			worker.postMessage(message, transfer)
		} else {
			worker.postMessage(message)
		}
	}

	return Object.assign(worker, {
		safePostMessage,
	})
}

type MessagesFromWorker =
	| { type: 'shareKeyPackage'; keyPkg: Uint8Array }
	| { type: 'sendMlsMessage'; msg: Uint8Array; senderId: string }
	| {
			type: 'sendMlsWelcome'
			senderId: string
			welcome: Uint8Array
			rtree: Uint8Array
	  }
	| { type: 'newSafetyNumber'; hash: Uint8Array }

export class EncryptionWorker {
	get worker(): Worker {
		invariant(
			this._worker !== null,
			'worker not yet initialized, call initialize() or initializeAndCreateGroup() first'
		)
		return this._worker
	}

	_worker: Worker | null = null
	safetyNumber: number = -1
	id: string

	constructor(config: { createGroup: boolean; id: string }) {
		this.id = config.id
		if (config.createGroup) {
			this.initializeAndCreateGroup()
		} else {
			this.initialize()
		}
	}

	dispose() {
		this.worker.terminate()
	}

	initialize() {
		this._worker = new Worker('/e2ee/worker.js')
		this.worker.postMessage({ type: 'initialize', id: this.id })
	}

	initializeAndCreateGroup() {
		this._worker = new Worker('/e2ee/worker.js')
		this.worker.postMessage({ type: 'initializeAndCreateGroup', id: this.id })
	}

	userJoined(keyPkg: Uint8Array) {
		this.worker.postMessage({ type: 'userJoined', keyPkg })
	}

	userLeft(id: string) {
		this.worker.postMessage({ type: 'userLeft', id })
	}

	receiveMlsWelcome(senderId: string, welcome: Uint8Array, rtree: Uint8Array) {
		this.worker.postMessage({
			type: 'recvMlsWelcome',
			welcome,
			rtree,
			senderId,
		})
	}

	receiveMlsMessage(msg: Uint8Array, senderId: string) {
		const message = {
			msg,
			senderId,
			type: 'recvMlsMessage',
		}
		console.log('passing receiveMlsMessage into worker', message)
		this.worker.postMessage(message)
	}

	async setupSenderTransform(sender: RTCRtpSender) {
		console.log('Setting up sender transform')

		// If this is Firefox, we will have to use RTCRtpScriptTransform
		if (window.RTCRtpScriptTransform) {
			sender.transform = new RTCRtpScriptTransform(this.worker, {
				operation: 'encryptStream',
			})
			return
		}

		// Otherwise if this is Chrome we'll have to use createEncodedStreams
		if (
			'createEncodedStreams' in sender &&
			typeof sender.createEncodedStreams === 'function'
		) {
			const senderStreams = sender.createEncodedStreams()
			const { readable, writable } = senderStreams
			this.worker.postMessage(
				{
					type: 'encryptStream',
					in: readable,
					out: writable,
				},
				[readable, writable]
			)

			return
		}

		throw new Error(
			'Neither RTCRtpScriptTransform nor RTCRtpSender.createEncodedStreams methods supported'
		)
	}

	async setupReceiverTransform(receiver: RTCRtpReceiver) {
		console.log('Setting up receiver transform')

		// If this is Firefox, we will have to use RTCRtpScriptTransform
		if (window.RTCRtpScriptTransform) {
			receiver.transform = new RTCRtpScriptTransform(this.worker, {
				operation: 'decryptStream',
			})

			return
		}

		// Otherwise if this is Chrome we'll have to use createEncodedStreams
		if (
			'createEncodedStreams' in receiver &&
			typeof receiver.createEncodedStreams === 'function'
		) {
			const senderStreams = receiver.createEncodedStreams()
			const { readable, writable } = senderStreams
			this.worker.postMessage(
				{
					type: 'decryptStream',
					in: readable,
					out: writable,
				},
				[readable, writable]
			)

			return
		}

		throw new Error(
			'Neither RTCRtpScriptTransform nor RTCRtpSender.createEncodedStreams methods supported'
		)
	}

	decryptStream(inStream: ReadableStream, outStream: WritableStream) {
		this.worker.postMessage({
			type: 'decryptStream',
			in: inStream,
			out: outStream,
		})
	}

	handleOutgoingEvents(onMessage: (data: string) => void) {
		this.worker.addEventListener('message', (event) => {
			const excludedEvents = ['workerReady', 'newSafetyNumber']
			if (!excludedEvents.includes(event.data.type)) {
				console.log('Message from worker in handleOutgoingEvents', event.data)
				onMessage(
					JSON.stringify(
						{
							...event.data,
							// senderId: this.id
						},
						replacer
					)
				)
			}
		})
	}

	handleIncomingEvent(data: string) {
		const message = JSON.parse(data, reviver) as MessagesFromWorker
		// the message type here came from another user's worker
		console.log('Incoming event: ', message.type, { message })
		switch (message.type) {
			case 'shareKeyPackage': {
				this.userJoined(message.keyPkg)
				break
			}
			case 'sendMlsWelcome': {
				this.receiveMlsWelcome(message.senderId, message.welcome, message.rtree)
				break
			}
			case 'sendMlsMessage': {
				this.receiveMlsMessage(message.msg, message.senderId)
				break
			}
		}
	}

	onNewSafetyNumber(handler: (safetyNumber: Uint8Array) => void) {
		this.worker.addEventListener('message', (event) => {
			if (event.data.type === 'newSafetyNumber') {
				handler(event.data.hash)
			}
		})
	}

	// handle messages from the worker, broadcasthing them to other users

	// handle incoming messages from other users

	/* TODO:
  {type: “encryptStream”, in: ReadableStream, out: WriteableStream}
  {type: “decryptStream”, in: ReadableStream, out: WriteableStream}
  ==============================================================================
  # Messages received by the main thread
  {type: “shareKeyPackage”, keyPkg: UInt8Array}
  {type: “sendMlsMessage”, msg: UInt8Array, senderId: str}
  {type: “sendMlsWelcome”, welcome: UInt8Array, rtree: UInt8Array}
  {type: “newSafetyNumber”, hash: UInt8Array}
  */
}

const FLAG_TYPED_ARRAY = 'FLAG_TYPED_ARRAY'
const FLAG_ARRAY_BUFFER = 'FLAG_ARRAY_BUFFER'

function replacer(_key: string, value: any) {
	if (value instanceof Uint8Array) {
		return { [FLAG_TYPED_ARRAY]: true, data: Array.from(value) }
	}
	if (value instanceof ArrayBuffer) {
		return {
			[FLAG_ARRAY_BUFFER]: true,
			data: Array.from(new Uint8Array(value)),
		}
	}
	return value
}

function reviver(_key: string, value: any) {
	if (value && value[FLAG_TYPED_ARRAY]) {
		return Uint8Array.from(value.data)
	}
	if (value && value[FLAG_ARRAY_BUFFER]) {
		return new Uint8Array(value.data).buffer
	}
	return value
}

export function useE2EE({
	enabled = false,
	room,
	partyTracks,
}: {
	enabled?: boolean
	partyTracks: PartyTracks
	room: ReturnType<typeof useRoom>
}) {
	// only want this to be evaluated once
	const [firstUser] = useState(room.otherUsers.length === 0)
	const [safetyNumber, setSafetyNumber] = useState<string>()

	const encryptionWorker = useMemo(
		() =>
			new EncryptionWorker({
				createGroup: firstUser,
				id: room.websocket.id,
			}),
		[firstUser, room.websocket.id]
	)

	useEffect(() => {
		encryptionWorker.onNewSafetyNumber((buffer) =>
			setSafetyNumber(arrayBufferToDecimal(buffer))
		)
		return () => {
			encryptionWorker.dispose()
		}
	}, [encryptionWorker])

	useEffect(() => {
		if (!enabled) return

		const subscription = partyTracks.transceiver$.subscribe((transceiver) => {
			if (transceiver.direction === 'sendonly') {
				// if (
				// 	typeof RTCRtpSender.getCapabilities !== 'undefined' &&
				// 	typeof transceiver.setCodecPreferences !== 'undefined' &&
				// 	transceiver.sender.track?.kind === 'video'
				// ) {
				// 	const capability = RTCRtpSender.getCapabilities('video')
				// 	const codecs = capability ? capability.codecs : []
				// 	codecs.sort((a, b) =>
				// 		a.mimeType === 'video/VP9' && b.mimeType !== 'video/VP9' ? -1 : 0
				// 	)
				// 	transceiver.setCodecPreferences(codecs)
				// }
				console.log('Setting up sender transform', transceiver.sender)
				encryptionWorker.setupSenderTransform(transceiver.sender)
			} else if (transceiver.direction === 'recvonly') {
				encryptionWorker.setupReceiverTransform(transceiver.receiver)
			}
		})

		return () => {
			subscription.unsubscribe()
		}
	}, [enabled, encryptionWorker, partyTracks.transceiver$])

	// TODO: Broadcast MLS room messages

	useEffect(() => {
		if (!enabled) return
		encryptionWorker.handleOutgoingEvents((data) => {
			console.log('📬 sending e2eeMlsMessage to peers', data)
			room.websocket.send(
				JSON.stringify({
					type: 'e2eeMlsMessage',
					payload: data,
				})
			)
		})
	}, [enabled, encryptionWorker, room.websocket])

	useEffect(() => {
		if (!enabled) return
		const handler = (event: MessageEvent) => {
			const message = JSON.parse(event.data) as ServerMessage
			if (message.type === 'e2eeMlsMessage') {
				console.log('📨 incoming e2eeMlsMessage from peer', message)
				encryptionWorker.handleIncomingEvent(message.payload)
			}
			if (message.type === 'userLeftNotification') {
				encryptionWorker.userLeft(message.id)
			}
		}

		room.websocket.addEventListener('message', handler)

		return () => {
			room.websocket.removeEventListener('message', handler)
		}
	}, [enabled, encryptionWorker, room.websocket])

	return enabled ? safetyNumber : undefined
}

function arrayBufferToDecimal(buffer: ArrayBuffer) {
	const byteArray = new Uint8Array(buffer) // Create a typed array from the ArrayBuffer
	const hexArray = Array.from(byteArray, (byte) => {
		return byte.toString(10).padStart(2, '0') // Convert each byte to a 2-digit hex string
	})
	return hexArray.join('') // Join all hex strings into a single string
}

/*

Message Flow Overview
We describe a high level overview of the message flow for an end-to-end encrypted Orange Meets room.

First user joins the room:
client JS --"initializeAndCreateGroup"--> worker
client JS --"encryptStream"--> worker     These two calls merely pass the infinite stream of audio/video to the worker. The worker doesn't do anything with it for now, but it will use it once there are recipients.
client JS --"decryptStream"--> worker
Nothing is sent, because nobody else is in the room
Second user joins the room:
client JS --"initialize"--> worker
client JS --"encryptStream"--> worker These two calls can happen in parallel with the rest of the flow
client JS --"decryptStream"--> worker
worker --"shareKeyPackage"--> client JS --keyPkg--> durable object --keyPkg--> recip JS --"userJoined"--> recip worker
recip worker --"sendMlsWelcome"--> client JS --msg--> durable object --msg--> recip JS --"recvMlsWelcome"--> recip worker
recip worker --"sendMlsMessage"--> client JS --msg--> durable object --msg--> recip JS --"recvMlsMessage"--> recip worker
worker --"newSafetyNumber"--> client JS


Third user joins the room:

<same as above>



Second user leaves the room

client JS --"userLeft"--> durable object --"userLeft"--> recip JS --"userLeft"--> recip worker
recip worker --"sendMlsMessage"--> client JS --msg--> durable object --msg--> recip JS --"recvMlsMessage"--> recip worker
worker --"newSafetyNumber"--> client JS

*/
