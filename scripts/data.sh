#!/bin/sh
# `npm run data`: raw JSON (data/raw) -> static JSON the app imports (src/data/generated).
# DATA_ENGINE=goose  build and run the Goose CLI (clean environment); fail if it cannot
# DATA_ENGINE=ts     the original TypeScript logic
# DATA_ENGINE=python python3 python/footy.py (standard library only)
# DATA_ENGINE=wasm   the committed Goose wasm (goose/dist) run by Node: Goose with no Goose compiler (this is what Netlify uses)
# DATA_ENGINE=auto   (default) native Goose if its compiler is installed, else the committed wasm, else Python, else TS,
#                    each with a warning when it steps down
# DATA_VERIFY=1      also run the TS engine and fail unless the outputs are byte-identical
set -e
cd "$(dirname "$0")/.."
ENGINE=${DATA_ENGINE:-auto}
RAW=${DATA_RAW:-data/raw}
OUT=${DATA_OUT:-src/data/generated}
mkdir -p "$OUT"

use_goose() {
  trap 'rm -f "$OUT"/*.tmp' EXIT
  BIN=$(sh goose/build.sh) || return 1
  [ -x "$BIN" ] || return 1
  # the binary is untrusted-ish: run it with an empty environment
  env -i PATH=/usr/bin:/bin "$BIN" standings < "$RAW/standings.json" > "$OUT/standings.json.tmp" || return 1
  env -i PATH=/usr/bin:/bin "$BIN" results < "$RAW/results.json" > "$OUT/results.json.tmp" || return 1
  mv "$OUT/standings.json.tmp" "$OUT/standings.json"
  mv "$OUT/results.json.tmp" "$OUT/results.json"
  echo "engine=goose  wrote $OUT/standings.json and $OUT/results.json"
}

use_python() {
  trap 'rm -f "$OUT"/*.tmp' EXIT
  python3 -I python/footy.py standings < "$RAW/standings.json" > "$OUT/standings.json.tmp" || return 1
  python3 -I python/footy.py results < "$RAW/results.json" > "$OUT/results.json.tmp" || return 1
  mv "$OUT/standings.json.tmp" "$OUT/standings.json"
  mv "$OUT/results.json.tmp" "$OUT/results.json"
  echo "engine=python  wrote $OUT/standings.json and $OUT/results.json"
}

use_wasm() {
  trap 'rm -f "$OUT"/*.tmp' EXIT
  NODE=$(command -v node) || return 1
  [ -f goose/dist/goose-footy.wasm ] || { echo "goose/dist/goose-footy.wasm is missing" >&2; return 1; }
  # same rule as the native binary: it gets an empty environment, so it can never see FOOTBALL_DATA_TOKEN
  env -i PATH=/usr/bin:/bin "$NODE" scripts/run-wasm.mjs standings < "$RAW/standings.json" > "$OUT/standings.json.tmp" || return 1
  env -i PATH=/usr/bin:/bin "$NODE" scripts/run-wasm.mjs results < "$RAW/results.json" > "$OUT/results.json.tmp" || return 1
  mv "$OUT/standings.json.tmp" "$OUT/standings.json"
  mv "$OUT/results.json.tmp" "$OUT/results.json"
  echo "engine=wasm  wrote $OUT/standings.json and $OUT/results.json"
}

# Python, then TS, each with a warning when it steps down.
fall_back_to_python() {
  rm -f "$OUT"/*.tmp
  if ! command -v python3 >/dev/null; then
    echo "warning: python3 missing, using the TS engine" >&2
    node scripts/gen-ts.mjs "$RAW" "$OUT"
  elif ! use_python; then
    echo "warning: the Python engine failed (its error is above), using the TS engine" >&2
    rm -f "$OUT"/*.tmp
    node scripts/gen-ts.mjs "$RAW" "$OUT"
  fi
}

case "$ENGINE" in
  ts) node scripts/gen-ts.mjs "$RAW" "$OUT" ;;
  wasm) use_wasm ;;
  goose) use_goose ;;
  python) use_python ;;
  auto)
    GOOSE_BIN=${GOOSE:-$HOME/.local/share/goose-lang/build/goose}
    if [ -x "$GOOSE_BIN" ] && use_goose; then
      :
    else
      [ -x "$GOOSE_BIN" ] && echo "warning: the Goose engine failed (its error is above), trying the committed wasm" >&2
      rm -f "$OUT"/*.tmp
      if ! use_wasm; then
        echo "warning: the wasm engine failed (its error is above), trying Python" >&2
        fall_back_to_python
      fi
    fi ;;
  *) echo "DATA_ENGINE must be python, goose, wasm, ts or auto" >&2; exit 2 ;;
esac

if [ "${DATA_VERIFY:-0}" = 1 ]; then
  T=$(mktemp -d)
  node scripts/gen-ts.mjs "$RAW" "$T" >/dev/null
  cmp "$T/standings.json" "$OUT/standings.json" && cmp "$T/results.json" "$OUT/results.json" && echo "verified: identical to the TS engine"
  rm -rf "$T"
fi
