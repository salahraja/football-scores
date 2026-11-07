#!/bin/sh
# Builds goose/fetch.goose (with goose/net.c and the system libcurl) to $OUT/fetch in a clean environment.
# GOOSE=path to the goose compiler (default ~/.local/share/goose-lang/build/goose).
set -e
cd "$(dirname "$0")/.."
GOOSE=${GOOSE:-$HOME/.local/share/goose-lang/build/goose}
OUT=${OUT:-$HOME/.cache/football-scores-gfetch}
[ -x "$GOOSE" ] || { echo "error: no Goose compiler at $GOOSE (set GOOSE=; see README)" >&2; exit 1; }
mkdir -p "$OUT/home"
env -i PATH=/usr/bin:/bin:/opt/homebrew/bin HOME="$OUT/home" GOOSE_HOME="$OUT/home/.goose" \
  "$GOOSE" build -q goose/fetch.goose -o "$OUT/fetch" >&2
echo "$OUT/fetch"
