#!/bin/sh
# Builds goose/cli.goose to $OUT/footy in a clean environment (no tokens, no cloud credentials).
# GOOSE=path to the goose compiler (default /private/tmp/goose-spike/goose/build/goose).
set -e
cd "$(dirname "$0")/.."
GOOSE=${GOOSE:-/private/tmp/goose-spike/goose/build/goose}
OUT=${OUT:-/private/tmp/goose-spike/out}
mkdir -p "$OUT" /private/tmp/goose-home
env -i PATH=/usr/bin:/bin:/opt/homebrew/bin HOME=/private/tmp/goose-home GOOSE_HOME=/private/tmp/goose-home/.goose \
  "$GOOSE" build -q goose/cli.goose -o "$OUT/footy" >&2
echo "$OUT/footy"
