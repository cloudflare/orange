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

// This is a thin wrapper around the Rust worker. This forwards all received events to processEvent, and returns the value via self.postMessage
onmessage = async (event /* MessageEvent */) => {
  console.log('Worker received message:', event.data)
  await wasm_is_ready; // Need to load WASM before doing anything
  //const ret = await processEvent(event.data);
  //self.postMessage(ret);

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
