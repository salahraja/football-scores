#!/bin/sh
# Goose -> C -> patched C -> wasm64 (memory64) with the clang from wasi-sdk (official release) plus goose/wasm/shim64.c.
# Output: goose/dist/goose-footy.wasm (committed) and goose/dist/goose-footy.wasm.sha256; intermediate C goes to $W.
# SDK   = the unpacked wasi-sdk dir  (default ~/.local/share/wasi-sdk/wasi-sdk-34.0-arm64-macos)
# GOOSE = the Goose compiler         (default ~/.local/share/goose-lang/build/goose, github.com/aardappel/goose at a108677d)
# OUT   = output dir (default goose/dist);  W = scratch dir (default ~/.cache/football-scores-wasm)
# Why wasm64 and not wasm32: the generated code lays records out for 8-byte pointers; see docs/goose-spike.md.
set -e
cd "$(dirname "$0")/../.."
W=${W:-$HOME/.cache/football-scores-wasm}; OUT=${OUT:-goose/dist}; mkdir -p "$W" "$OUT"
SDK=${SDK:-$HOME/.local/share/wasi-sdk/wasi-sdk-34.0-arm64-macos}
GOOSE=${GOOSE:-$HOME/.local/share/goose-lang/build/goose}
[ -x "$GOOSE" ] || { echo "error: no Goose compiler at $GOOSE (set GOOSE=; see README, 'Rebuilding the wasm')" >&2; exit 1; }
[ -x "$SDK/bin/clang" ] || { echo "error: no wasi-sdk clang at $SDK/bin/clang (set SDK=; see README, 'Rebuilding the wasm')" >&2; exit 1; }
ENTRY=${ENTRY:-goose/wasm_entry.goose}
EXPORTS=${EXPORTS:-goose_init,malloc,fs_in_reserve,fs_in_ptr,fs_out_ptr,fs_run}
mkdir -p "$W/home"
env -i PATH=/usr/bin:/bin HOME="$W/home" GOOSE_HOME="$W/home/.goose" \
  "$GOOSE" -q --standalone --header "$W/fs.h" -o "$W/fs.c" "$ENTRY"
python3 -I goose/wasm/patch_c.py "$W/fs.c" "$W/fs.patched.c"
env -i PATH=/usr/bin:/bin "$SDK/bin/clang" --target=wasm64-unknown-wasi -isystem "$SDK/share/wasi-sysroot/include/wasm32-wasip1" \
  ${OPT:--O2} -nostdlib -mbulk-memory -DGS_STACK_RESERVE=33554432 -DGS_STACK_GAP=65536 \
  "$W/fs.patched.c" goose/wasm/shim64.c -o "${OUT_NAME:-$OUT/goose-footy.wasm}" \
  -Wl,--no-entry -Wl,-z,stack-size=1048576 $(echo "$EXPORTS" | tr ',' '\n' | sed 's/^/-Wl,--export=/' | tr '\n' ' ')
ls -l "${OUT_NAME:-$OUT/goose-footy.wasm}"
# the checksum file sits next to the wasm and is checked by tests/wasm-committed.test.ts
if [ -z "$OUT_NAME" ]; then (cd "$OUT" && shasum -a 256 goose-footy.wasm > goose-footy.wasm.sha256); fi
