#!/bin/sh
# Builds goose/export_demo.goose as a C shared library and calls it from Python ctypes (proof the C ABI works).
set -e
cd "$(dirname "$0")/.."
GOOSE=${GOOSE:-/private/tmp/goose-spike/goose/build/goose}
export GOOSE_HOME=${GOOSE_HOME:-/private/tmp/goose-home/.goose}
OUT=${OUT:-/private/tmp/goose-spike/out}; mkdir -p "$OUT"
env -i PATH=/usr/bin:/bin HOME=/private/tmp/goose-home GOOSE_HOME="$GOOSE_HOME" \
  "$GOOSE" -q --standalone --header "$OUT/demo.h" -o "$OUT/demo.c" goose/export_demo.goose
clang -O2 -dynamiclib -o "$OUT/libdemo.dylib" "$OUT/demo.c"
/usr/bin/python3 -c "
import ctypes; l=ctypes.CDLL('$OUT/libdemo.dylib'); l.goose_init(0,None)
print('points_for(7,2)=', l.fs_points_for(7,2), 'outcome(0,3)=', l.fs_outcome(0,3), 'outcome(2,2)=', l.fs_outcome(2,2))"
