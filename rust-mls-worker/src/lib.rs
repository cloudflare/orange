use log::{info, Level};
use mls_ops::{decrypt_msg, encrypt_msg, WelcomePackageOut, WorkerResponse};
use openmls::prelude::tls_codec::Serialize;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::{
    js_sys::{
        Array, ArrayBuffer, Object,
        Reflect::{get as obj_get, set as obj_set},
        Uint8Array,
    },
    ReadableStream, ReadableStreamDefaultReader, RtcEncodedAudioFrame, RtcEncodedVideoFrame,
    WritableStream, WritableStreamDefaultWriter,
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

/// Sets some logging globals
#[wasm_bindgen]
#[allow(non_snake_case)]
pub fn initLogging() {
    console_log::init_with_level(Level::Info).unwrap();
    console_error_panic_hook::set_once();
}

/// Processes an event and returns an object that's null, i.e., no return value, or consists of
/// fields "type": str, "payload_name": str, and "payload": ArrayBuffer.
#[wasm_bindgen]
#[allow(non_snake_case)]
pub async fn processEvent(event: Object) -> JsValue {
    let ty = obj_get(&event, &"type".into())
        .expect("event expects input field 'type'")
        .as_string()
        .expect("event field 'type' must be a string");
    let ty = ty.as_str();
    info!("Received event of type {ty} from main thread");

    let ret = match ty {
        "encryptStream" | "decryptStream" => {
            // Grab the streams from the object and pass them to `process_stream`
            let read_stream: ReadableStream = obj_get(&event, &"in".into())
                .expect("encrypt/decryptStream event expects input field 'in'")
                .dyn_into()
                .expect("encrypt/decryptStream field 'in' must be a ReadableStream");
            let write_stream: WritableStream = obj_get(&event, &"out".into())
                .expect("encrypt/decryptStream event expects input field 'out'")
                .dyn_into()
                .expect("encrypt/decryptStream field 'out' must be a WritableStream");
            let reader = ReadableStreamDefaultReader::new(&read_stream).unwrap();
            let writer = write_stream.get_writer().unwrap();

            if ty == "encryptStream" {
                process_stream(reader, writer, encrypt_msg).await;
            } else {
                process_stream(reader, writer, decrypt_msg).await;
            }

            // No response necessary if we're just writing between two streams
            None
        }

        "initialize" => {
            let user_id = obj_get(&event, &"id".into())
                .expect("initialize event expects input field 'id'")
                .as_string()
                .expect("initialize field 'id' must be a string");
            Some(mls_ops::new_state(&user_id))
        }

        "initializeAndCreateGroup" => {
            let user_id = obj_get(&event, &"id".into())
                .expect("initializeAndCreateGroup event expects input field 'id'")
                .as_string()
                .expect("initializeAndCreateGroup field 'id' must be a string");
            Some(mls_ops::new_state_and_start_group(&user_id))
        }

        "userJoined" => {
            let key_pkg_bytes = extract_bytes_field("userJoined", &event, "keyPkg");
            Some(mls_ops::add_user(&key_pkg_bytes))
        }

        "userLeft" => {
            let uid_to_remove = obj_get(&event, &"id".into()).unwrap().as_string().unwrap();
            Some(mls_ops::remove_user(&uid_to_remove))
        }

        "recvMlsWelcome" => {
            let welcome_bytes = extract_bytes_field("recvMlsWelcome", &event, "welcome");
            let rtree_bytes = extract_bytes_field("recvMlsWelcome", &event, "rtree");
            // We don't really use this field
            let _sender = obj_get(&event, &"senderId".into())
                .expect("recvMlsWelcome event expects input field 'senderId'")
                .as_string()
                .expect("recvMlsWelcome field 'senderId' must be a string");
            Some(mls_ops::join_group(&welcome_bytes, &rtree_bytes))
        }

        "recvMlsMessage" => {
            let msg_bytes = extract_bytes_field("recvMlsMessage", &event, "msg");
            let sender = obj_get(&event, &"senderId".into())
                .expect("recvMlsMessage event expects input field 'senderId'")
                .as_string()
                .expect("recvMlsMessage field 'senderId' must be a string");
            Some(mls_ops::handle_commit(&msg_bytes, &sender))
        }

        _ => panic!("unknown message type {ty} from main thread"),
    };

    // Now we have to format our response. We're gonna make a list of objects to send to the main
    // thread, and a list of the buffers in each object (we need these in order to properly transfer
    // data between threads)
    let obj_list = Array::new();
    let buffers_list = Array::new();
    if let Some(WorkerResponse {
        welcome,
        proposals,
        new_safety_number,
        key_pkg,
        sender_id,
    }) = ret
    {
        // Make the safety number object if a new safety number is given
        if let Some(sn) = new_safety_number {
            let (o, buffers) = make_obj_and_save_buffers("newSafetyNumber", &[("hash", &sn)]);

            // Accumulate the object and buffers
            obj_list.push(&o);
            buffers_list.push(&buffers);
        }

        // Make the key package object if a key package is given
        if let Some(kp) = key_pkg {
            let (o, buffers) = make_obj_and_save_buffers(
                "shareKeyPackage",
                &[("keyPkg", &kp.tls_serialize_detached().unwrap())],
            );

            // Accumulate the object and buffers
            obj_list.push(&o);
            buffers_list.push(&buffers);
        }

        // Make the welcome object if a welcome package is given
        if let Some(WelcomePackageOut {
            welcome,
            ratchet_tree,
        }) = welcome
        {
            let (o, buffers) = make_obj_and_save_buffers(
                "sendMlsWelcome",
                &[
                    ("welcome", &welcome.to_bytes().unwrap()),
                    ("rtree", &ratchet_tree.tls_serialize_detached().unwrap()),
                ],
            );
            set_sender_id(&o, sender_id.as_ref().unwrap());

            // Accumulate the object and buffers
            obj_list.push(&o);
            buffers_list.push(&buffers);
        }

        // Make MLS message objects if messages are given
        for msg in proposals {
            let (o, buffers) = make_obj_and_save_buffers(
                "sendMlsMessage",
                &[("msg", &msg.tls_serialize_detached().unwrap())],
            );
            set_sender_id(&o, sender_id.as_ref().unwrap());

            // Accumulate the object and buffers
            obj_list.push(&o);
            buffers_list.push(&buffers);
        }
    }

    // Finally, return an array [objs, payloads] for the worker JS script to go through and post to
    // the calling thread
    let ret = Array::new();
    ret.push(&obj_list);
    ret.push(&buffers_list);
    ret.dyn_into().unwrap()
}

/// Processes a posssibly infinite stream of `RtcEncodedAudio(/Video)Frame`s . Reads a frame from
/// `reader`, applies `f` to the frame data, then writes the output to `writer`.
async fn process_stream<F>(
    reader: ReadableStreamDefaultReader,
    writer: WritableStreamDefaultWriter,
    f: F,
) where
    F: Fn(&[u8]) -> Vec<u8>,
{
    loop {
        let promise = reader.read();

        // Await the call. This will return an object { value, done }, where value is a view
        // containing the new data, and done is a bool indicating that there is nothing left to read
        let res: Object = JsFuture::from(promise)
            .await
            .expect("failed to read stream chunk")
            .dyn_into()
            .expect("stream chunk must be an object");
        let done_reading = obj_get(&res, &"done".into()).unwrap().as_bool().unwrap();

        // Read a frame and get the underlying bytestring
        let frame = obj_get(&res, &"value".into()).unwrap();

        // Process the frame data
        let frame_data = get_frame_data(&frame);
        let chunk_len = frame_data.len();
        let new_frame_data = f(&frame_data);

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

/// Helper function. Given an object name and named bytestrings, returns the object
/// `{ type: name, [b[0]: b[1] as ArrayBuffer for b in bytestrings] },`
/// as well as the list
/// `[b[1] as ArrayBuffer for b in bytestrings]`
fn make_obj_and_save_buffers(name: &str, named_bytestrings: &[(&str, &[u8])]) -> (Object, Array) {
    let o = Object::new();
    let buffers = Array::new();
    // Make the object { type: name, ...}
    obj_set(&o, &"type".into(), &name.into()).unwrap();

    // Make the bytestrings into JS ArrayBuffers and add them to the object and buffer list
    for (field_name, bytes) in named_bytestrings {
        let arr = {
            let buf = ArrayBuffer::new(bytes.len() as u32);
            Uint8Array::new(&buf).copy_from(bytes);
            buf
        };

        obj_set(&o, &(*field_name).into(), &arr).unwrap();
        buffers.push(&arr);
    }

    (o, buffers)
}

/// Sets the `senderId` field in the given object to the given string
fn set_sender_id(o: &Object, sender_id: &str) {
    obj_set(o, &"senderId".into(), &sender_id.into()).unwrap();
}

/// Given an object `o` with field `field` of type `ArrayBuffer`, returns `o[field]` as a `Vec<u8>`
fn extract_bytes_field(event_name: &str, o: &Object, field: &'static str) -> Vec<u8> {
    let buf: ArrayBuffer = obj_get(o, &field.into())
        .unwrap_or_else(|_| panic!("{event_name} must have field '{field}'"))
        .dyn_into()
        .unwrap_or_else(|_| panic!("{event_name} field '{field}' must be an ArrayBuffer"));
    Uint8Array::new(&buf).to_vec()
}
