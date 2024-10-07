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
    ReadableStreamGetReaderOptions, ReadableStreamReaderMode, WritableStream,
};

/// Makes a BYOB reader, i.e., a zero-copy byte reader
fn make_byob_reader(stream: &ReadableStream) -> ReadableStreamByobReader {
    let options = ReadableStreamGetReaderOptions::new();
    options.set_mode(ReadableStreamReaderMode::Byob);
    console::log_1(&"converting reader".into());
    stream
        .get_reader_with_options(&options)
        .dyn_into::<ReadableStreamByobReader>()
        .unwrap()
}

/// Make a normal reader. This is more general than BYOB, and copies all values into a buffer
fn make_default_reader(stream: &ReadableStream) -> ReadableStreamDefaultReader {
    ReadableStreamDefaultReader::new(stream).unwrap()
}

#[wasm_bindgen]
pub async fn processEvent(event: Object) -> Object {
    let ty = obj_get(&event, &"type".into())
        .unwrap()
        .as_string()
        .unwrap();
    console::log_1(&format!("Received event of type {} from main thread", ty).into());

    if ty == "encryptStream" || ty == "decryptStream" {
        let read_stream: ReadableStream = obj_get(&event, &"in".into()).unwrap().into();
        let write_stream: WritableStream = obj_get(&event, &"out".into()).unwrap().into();
        let reader = make_default_reader(&read_stream);
        let writer = write_stream.get_writer().unwrap();

        /* No need to make a buffer when using a default reader. Save in case we
           need to use a BYOB reader
        // Now just read from the reader and write straight to the writer
        // Make a 10KB buffer
        const BUF_LEN: u32 = 10_000;
        let buf = ArrayBuffer::new(BUF_LEN);
        */

        loop {
            /* Old BYOB reader code
            // Call reader.read(buf, 0, BUF_LEN) to read into the whole buffer
            let view = Uint8Array::new_with_byte_offset_and_length(&buf, 0, BUF_LEN);
            let promise = reader.read_with_array_buffer_view(&view);
            */

            let promise = reader.read();

            // Await the call. This will return an object { value, done }, where
            // value is a view containing the new data, and done is a bool indicating
            // that there is nothing left to read
            let res: Object = JsFuture::from(promise).await.unwrap().into();
            let done_reading = obj_get(&res, &"done".into()).unwrap().as_bool().unwrap();
            let chunk_read: Uint8Array = obj_get(&res, &"value".into()).unwrap().into();

            // Write the read chunk to the writable stream. This promise returns nothing
            let promise = writer.write_with_chunk(&chunk_read);
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
