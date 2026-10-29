#!/bin/sh
set -e
cd "$(dirname "$0")/../.."
GOOSE=${GOOSE:-/private/tmp/goose-spike/goose/build/goose}
W=${W:-/private/tmp/wasm-fs}; mkdir -p "$W" /private/tmp/goose-home
env -i PATH=/usr/bin:/bin HOME=/private/tmp/goose-home GOOSE_HOME=/private/tmp/goose-home/.goose \
  "$GOOSE" -q --standalone --header "$W/fs.h" -o "$W/fs.c" goose/wasm_entry.goose
echo "$W/fs.c"
