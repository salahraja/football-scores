#!/bin/sh
# `npm run data:fetch`: Serie A from football-data.org into data/raw (DATA_RAW=dir to write elsewhere).
# The Goose fetch (goose/fetch.goose) when its compiler is installed, else scripts/fetch-data.mjs; both write the same bytes
# (tests/fetch-goose.test.ts) and neither ever fails the build. FETCH_ENGINE=node or goose forces one.
# The Goose binary gets an environment with only PATH and the token, which its C reads (goose/net.c); Goose code never holds it.
set -e
cd "$(dirname "$0")/.."
DIR=${DATA_RAW:-data/raw}
ENGINE=${FETCH_ENGINE:-auto}
GOOSE_BIN=${GOOSE:-$HOME/.local/share/goose-lang/build/goose}
if [ "$ENGINE" != node ] && { [ "$ENGINE" = goose ] || [ -x "$GOOSE_BIN" ]; }; then
  if BIN=$(sh goose/fetch.sh) && [ -x "$BIN" ]; then
    env -i PATH=/usr/bin:/bin FOOTBALL_DATA_TOKEN="${FOOTBALL_DATA_TOKEN:-}" "$BIN" "$DIR"
    exit 0
  fi
  [ "$ENGINE" = goose ] && { echo "fetch: the Goose fetch did not build" >&2; exit 1; }
  echo "warning: the Goose fetch did not build (its error is above), using the Node fetch" >&2
fi
DATA_RAW="$DIR" node scripts/fetch-data.mjs
