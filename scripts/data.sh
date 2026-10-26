#!/bin/sh
# `npm run data`: raw JSON (data/raw) -> static JSON the app imports (src/data/generated).
# DATA_ENGINE=goose  build and run the Goose CLI (clean environment); fail if it cannot
# DATA_ENGINE=ts     the original TypeScript logic
# DATA_ENGINE=python python3 python/footy.py (standard library only)
# DATA_ENGINE=auto   (default) Python if python3 is there, otherwise TS with a warning
# DATA_VERIFY=1      also run the TS engine and fail unless the outputs are byte-identical
set -e
cd "$(dirname "$0")/.."
ENGINE=${DATA_ENGINE:-auto}
RAW=${DATA_RAW:-data/raw}
OUT=${DATA_OUT:-src/data/generated}
mkdir -p "$OUT"

use_goose() {
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
  command -v python3 >/dev/null || return 1
  python3 -I python/footy.py standings < "$RAW/standings.json" > "$OUT/standings.json.tmp" || return 1
  python3 -I python/footy.py results < "$RAW/results.json" > "$OUT/results.json.tmp" || return 1
  mv "$OUT/standings.json.tmp" "$OUT/standings.json"
  mv "$OUT/results.json.tmp" "$OUT/results.json"
  echo "engine=python  wrote $OUT/standings.json and $OUT/results.json"
}

case "$ENGINE" in
  ts) node scripts/gen-ts.mjs "$RAW" "$OUT" ;;
  goose) use_goose ;;
  python) use_python ;;
  auto) use_python 2>/dev/null || { echo "warning: python3 unavailable, falling back to the TS engine" >&2; rm -f "$OUT"/*.tmp; node scripts/gen-ts.mjs "$RAW" "$OUT"; } ;;
  *) echo "DATA_ENGINE must be python, goose, ts or auto" >&2; exit 2 ;;
esac

if [ "${DATA_VERIFY:-0}" = 1 ]; then
  T=$(mktemp -d)
  node scripts/gen-ts.mjs "$RAW" "$T" >/dev/null
  cmp "$T/standings.json" "$OUT/standings.json" && cmp "$T/results.json" "$OUT/results.json" && echo "verified: identical to the TS engine"
  rm -rf "$T"
fi
