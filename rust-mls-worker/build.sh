#!/bin/sh

set -e

# cd to the directory this script is in
cd "$(dirname "$0")"

OUTDIR="../public/e2ee/wasm-pkg"

# This example requires to *not* create ES modules, therefore we pass the flag
# `--target no-modules`
wasm-pack build --target no-modules --out-dir "$OUTDIR"
