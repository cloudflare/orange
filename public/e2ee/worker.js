// The worker has its own scope and no direct access to functions/objects of the
// global scope. We import the generated JS file to make `wasm_bindgen`
// available which we need to initialize our Wasm code.
importScripts("/e2ee/wasm-pkg/orange_mls_worker.js");

// Use the `processEvent` top-level function defined in Rust
const { processEvent } = wasm_bindgen;

// Load the Wasm file by awaiting the Promise returned by `wasm_bindgen`.
async function init_wasm_in_worker() {
  await wasm_bindgen("/e2ee/wasm-pkg/orange_mls_worker_bg.wasm");
}
const wasm_is_ready = init_wasm_in_worker();

async function jsProcessEvent(event) {
	const ty = event.type;
	if (ty === "encryptStream" || ty === "decryptStream") {
		var read_stream = event.in.getReader();
		var write_stream = event.out.getWriter();

		while (true) {
			var { value, done } = await read_stream.read();
			if (done) {
				break;
			} else {
				if (value instanceof RTCEncodedVideoFrame) {
					console.log("Read chunk", value);
					var view = new Uint8Array(value.data);
					for (var i = 0; i < view.length; i++) {
						view[i] = 255;
					}
				}
				await write_stream.write(value);
			}
		}
	}

	return {type: "done"};
}

// This is a thin wrapper around the Rust worker. This forwards all received events to processEvent, and returns the value via self.postMessage
onmessage = async (event /* MessageEvent */) => {
  console.log('Worker received message:', event.data)
  await wasm_is_ready; // Need to load WASM before doing anything
  const receivedMessage = await processEvent(event.data);
  //const receivedMessage = await jsProcessEvent(event.data);
  const processedMessage = JSON.stringify(receivedMessage)

/*
  const receivedMessage = event.data;
  if (receivedMessage.type === 'encryptStream') {
    console.log('piping from in to out')
    receivedMessage.in.pipeTo(receivedMessage.out)
  }

  if (receivedMessage.type === 'decryptStream') {
    console.log('piping from in to out')
    receivedMessage.in.pipeTo(receivedMessage.out)
  }

  // Send a message back to the main script
  postMessage('Worker processed: ' + processedMessage)
*/
}

postMessage({ type: 'workerReady' })
