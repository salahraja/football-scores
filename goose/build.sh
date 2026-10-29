#!/bin/sh
# Builds goose/cli.goose to $OUT/footy in a clean environment (no tokens, no cloud credentials).
# GOOSE=path to the goose compiler (default ~/.local/share/goose-lang/build/goose, a build of github.com/aardappel/goose).
set -e
cd "$(dirname "$0")/.."
GOOSE=${GOOSE:-$HOME/.local/share/goose-lang/build/goose}
OUT=${OUT:-$HOME/.cache/football-scores-goose}
[ -x "$GOOSE" ] || { echo "error: no Goose compiler at $GOOSE (set GOOSE=; see README)" >&2; exit 1; }
mkdir -p "$OUT/home"
env -i PATH=/usr/bin:/bin:/opt/homebrew/bin HOME="$OUT/home" GOOSE_HOME="$OUT/home/.goose" \
  "$GOOSE" build -q goose/cli.goose -o "$OUT/footy" >&2
echo "$OUT/footy"
