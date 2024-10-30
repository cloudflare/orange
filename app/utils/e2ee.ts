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

export async function setupSenderTransform(sender: RTCRtpSender) {
	const worker = await loadWorker(console.log)

	if (
		'createEncodedStreams' in sender &&
		typeof sender.createEncodedStreams === 'function'
	) {
		const senderStreams = sender.createEncodedStreams()
		const { readable, writable } = senderStreams
		worker.safePostMessage(
			{
				type: 'encryptStream',
				in: readable,
				out: writable,
			},
			[readable, writable]
		)
	} else {
		throw new Error('e2ee not supported')
	}
}

export async function setupReceiverTransform(receiver: RTCRtpReceiver) {
	const worker = await loadWorker(console.log)
	if (
		'createEncodedStreams' in receiver &&
		typeof receiver.createEncodedStreams === 'function'
	) {
		const senderStreams = receiver.createEncodedStreams()
		const { readable, writable } = senderStreams
		worker.safePostMessage(
			{
				type: 'decryptStream',
				in: readable,
				out: writable,
			},
			[readable, writable]
		)
	} else {
		throw new Error('e2ee not supported')
	}
}
