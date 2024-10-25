// The worker has its own scope and no direct access to functions/objects of the global scope. We
// import the generated JS file to make `wasm_bindgen` available which we need to initialize our
// Wasm code.
importScripts('/e2ee/wasm-pkg/orange_mls_worker.js')

// Use the `processEvent` top-level function defined in Rust
const { processEvent } = wasm_bindgen

// Load the Wasm file by awaiting the Promise returned by `wasm_bindgen`.
async function init_wasm_in_worker() {
	await wasm_bindgen('/e2ee/wasm-pkg/orange_mls_worker_bg.wasm')
}
const wasm_is_ready = init_wasm_in_worker()

// This is a thin wrapper around the Rust worker. This forwards all received events to processEvent,
// and returns the value via self.postMessage
onmessage = async (event /* MessageEvent */) => {
	// Need to load WASM before doing anything
	await wasm_is_ready
	console.log('Worker received message:', event.data)

	// Process the event and get a response of the form {type, payload_name, payload}
	// where payload is always an ArrayBuffer of bytes
	const wasmOut = await processEvent(event.data)

	if (wasmOut != null) {
		const { type, payload_name, payload } = wasmOut
		var msgToPost = { type: type }
		msgToPost[payload_name] = payload
		// Need to transfer the ArrayBuffer, so include payload in the transfer field of postMessage
		postMessage(msgToPost, [payload])
	}
}

postMessage({ type: 'workerReady' })
