#!/bin/sh
# Goose -> C -> patched C -> wasm64 (memory64) with the clang from wasi-sdk (official release, installed only under
# /private/tmp/wasi-sdk) plus goose/wasm/shim64.c. Output: $OUT/goose-footy.wasm
# Why wasm64 and not wasm32: the generated code lays records out for 8-byte pointers; see docs/goose-spike.md.
set -e
cd "$(dirname "$0")/../.."
W=${W:-/private/tmp/wasm-fs}; OUT=${OUT:-$W}; mkdir -p "$W" "$OUT"
SDK=${SDK:-/private/tmp/wasi-sdk/wasi-sdk-34.0-arm64-macos}
ENTRY=${ENTRY:-goose/wasm_entry.goose}
EXPORTS=${EXPORTS:-goose_init,malloc,fs_in_reserve,fs_in_ptr,fs_out_ptr,fs_run}
mkdir -p /private/tmp/goose-home
env -i PATH=/usr/bin:/bin HOME=/private/tmp/goose-home GOOSE_HOME=/private/tmp/goose-home/.goose \
  ${GOOSE:-/private/tmp/goose-spike/goose/build/goose} -q --standalone --header "$W/fs.h" -o "$W/fs.c" "$ENTRY"
python3 -I goose/wasm/patch_c.py "$W/fs.c" "$W/fs.patched.c"
env -i PATH=/usr/bin:/bin "$SDK/bin/clang" --target=wasm64-unknown-wasi -isystem "$SDK/share/wasi-sysroot/include/wasm32-wasip1" \
  ${OPT:--O2} -nostdlib -mbulk-memory -DGS_STACK_RESERVE=33554432 -DGS_STACK_GAP=65536 \
  "$W/fs.patched.c" goose/wasm/shim64.c -o "${OUT_NAME:-$OUT/goose-footy.wasm}" \
  -Wl,--no-entry -Wl,-z,stack-size=1048576 $(echo "$EXPORTS" | tr ',' '\n' | sed 's/^/-Wl,--export=/' | tr '\n' ' ')
ls -l "${OUT_NAME:-$OUT/goose-footy.wasm}"
