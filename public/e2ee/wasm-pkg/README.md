# Rust WASM Module End-to-end Encryption

This crate provides an interface for Orange Meets end-to-end encryption functionality. The entrypoint can be found in [`e2ee.ts`](app/utils/e2ee.ts).

## How to build

1. [Install `wasm-pack`](https://rustwasm.github.io/wasm-pack/installer/). If you have cargo, you can just do `cargo install wasm-pack`
2. Run `./build.sh` to build the Rust into WASM. This will populate the `public/e2ee/wasm-pkg/` directory with WASM and JS files
3. Run Orange Meets as usual
