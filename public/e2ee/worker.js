// The worker has its own scope and no direct access to functions/objects of the global scope. We
// import the generated JS file to make `wasm_bindgen` available which we need to initialize our
// Wasm code.
importScripts('/e2ee/wasm-pkg/orange_mls_worker.js')

// Use the `processEvent` top-level function defined in Rust
const { initLogging, processEvent } = wasm_bindgen

// Load the Wasm file by awaiting the Promise returned by `wasm_bindgen`.
async function initWasmInWorker() {
	await wasm_bindgen('/e2ee/wasm-pkg/orange_mls_worker_bg.wasm')
	initLogging()
}
const wasmIsReady = initWasmInWorker()

// This is a thin wrapper around the Rust worker. This forwards all received events to processEvent,
// and returns the value via self.postMessage
onmessage = async (event /* MessageEvent */) => {
	// Need to load WASM before doing anything
	await wasmIsReady

	// Process the event and get a response of the form [objects, buffers]
	// where objects are the values to post to the main thread, and buffers are the lists of of
	// ArrayBuffers that need to be transfered
	const [objects, buffers] = await processEvent(event.data)

	// Post all the messages back to the main thread
	for (i in objects) {
		postMessage(objects[i], buffers[i])
	}
}

// Handler for RTCRtpScriptTransforms (Firefox uses bc it doesn't have createEncodedStream).
// This just repackages the event and sends it to onmessage.
onrtctransform = async (event /* RTCTransformEvent */) => {
		const transformer = event.transformer;
		const repackagedEvent = {
			"ty": transformer.options.operation,
			"in": transformer.readable,
			"out": transformer.writable
		};
		// Pass it to handler we defined above
		await self.onmessage(repackagedEvent);
};

postMessage({ type: 'workerReady' })
