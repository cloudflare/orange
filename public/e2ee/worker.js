// Listen for messages from the main script
onmessage = (event) => {
	console.log('Worker received message:', event.data)

	// Process the received message
	const receivedMessage = event.data

	if (receivedMessage.type === 'encryptStream') {
		console.log('piping from in to out')
		receivedMessage.in.pipeTo(receivedMessage.out)
	}

	if (receivedMessage.type === 'decryptStream') {
		console.log('piping from in to out')
		receivedMessage.in.pipeTo(receivedMessage.out)
	}

	const processedMessage = JSON.stringify(receivedMessage)

	// Send a message back to the main script
	postMessage('Worker processed: ' + processedMessage)
}

postMessage({ type: 'workerReady' })
