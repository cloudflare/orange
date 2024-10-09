use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::{
    console,
    js_sys::{
        ArrayBuffer, Object,
        Reflect::{get as obj_get, set as obj_set},
        Uint8Array,
    },
    ReadableStream, ReadableStreamByobReader, ReadableStreamDefaultReader,
    ReadableStreamGetReaderOptions, ReadableStreamReaderMode, RtcEncodedAudioFrame,
    RtcEncodedVideoFrame, WritableStream,
};

mod mls_ops;

/// Given an `RtcEncodedAudioFrame` or `RtcEncodedVideoFrame`, returns the frame's byte contents
fn get_frame_data(frame: &JsValue) -> Vec<u8> {
    if RtcEncodedAudioFrame::instanceof(frame) {
        let frame: &RtcEncodedAudioFrame = frame.dyn_ref().unwrap();
        Uint8Array::new(&frame.data()).to_vec()
    } else if RtcEncodedVideoFrame::instanceof(frame) {
        let frame: &RtcEncodedVideoFrame = frame.dyn_ref().unwrap();
        Uint8Array::new(&frame.data()).to_vec()
    } else {
        panic!("frame value of unknown type");
    }
}

/// Given an `RtcEncodedAudioFrame` or `RtcEncodedVideoFrame` and a bytestring, sets frame's bytestring
fn set_frame_data(frame: &JsValue, new_data: &[u8]) {
    // Copy the new data into an ArrayBuffer
    let buf = ArrayBuffer::new(new_data.len() as u32);
    let view = Uint8Array::new(&buf);
    view.copy_from(new_data);

    if RtcEncodedAudioFrame::instanceof(frame) {
        let frame: &RtcEncodedAudioFrame = frame.dyn_ref().unwrap();
        frame.set_data(&buf);
    } else if RtcEncodedVideoFrame::instanceof(frame) {
        let frame: &RtcEncodedVideoFrame = frame.dyn_ref().unwrap();
        frame.set_data(&buf);
    } else {
        panic!("frame value of unknown type");
    }
}

#[wasm_bindgen]
pub async fn processEvent(event: Object) -> Object {
    let ty = obj_get(&event, &"type".into())
        .unwrap()
        .as_string()
        .unwrap();
    console::log_1(&format!("Received event of type {} from main thread", ty).into());

    if ty == "encryptStream" || ty == "decryptStream" {
        let read_stream: ReadableStream =
            obj_get(&event, &"in".into()).unwrap().dyn_into().unwrap();
        let write_stream: WritableStream =
            obj_get(&event, &"out".into()).unwrap().dyn_into().unwrap();
        let reader = ReadableStreamDefaultReader::new(&read_stream).unwrap();
        let writer = write_stream.get_writer().unwrap();

        loop {
            let promise = reader.read();

            // Await the call. This will return an object { value, done }, where
            // value is a view containing the new data, and done is a bool indicating
            // that there is nothing left to read
            let res: Object = JsFuture::from(promise).await.unwrap().dyn_into().unwrap();
            let done_reading = obj_get(&res, &"done".into()).unwrap().as_bool().unwrap();

            // Read a frame and get the underlying bytestring
            let frame = obj_get(&res, &"value".into()).unwrap();

            // Stub for processing the frame data
            let frame_data = get_frame_data(&frame);
            let chunk_len = frame_data.len();
            console::log_1(&format!("Read chunk of size {chunk_len}").into());
            //let new_frame_data = vec![0u8; frame_data.len() + 100];
            let new_frame_data = frame_data;

            // Set the new frame data value
            set_frame_data(&frame, &new_frame_data);

            // Write the read chunk to the writable stream. This promise returns nothing
            let promise = writer.write_with_chunk(&frame);
            JsFuture::from(promise).await.unwrap();

            if done_reading {
                break;
            }
        }
    }

    // Return some dummy object
    let ret = Object::new();
    obj_set(&ret, &"type".into(), &"mlsMessage".into()).unwrap();
    obj_set(&ret, &"msg".into(), &Uint8Array::default()).unwrap();
    ret
}
