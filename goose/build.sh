#!/bin/sh
# Builds goose/cli.goose to $OUT/footy in a clean environment (no tokens, no cloud credentials).
# GOOSE=path to the goose compiler (default ~/.local/share/goose-lang/build/goose, a build of github.com/aardappel/goose).
set -e
cd "$(dirname "$0")/.."
GOOSE=${GOOSE:-$HOME/.local/share/goose-lang/build/goose}
OUT=${OUT:-$HOME/.cache/football-scores-goose}
mkdir -p "$OUT" /private/tmp/goose-home
env -i PATH=/usr/bin:/bin:/opt/homebrew/bin HOME=/private/tmp/goose-home GOOSE_HOME=/private/tmp/goose-home/.goose \
  "$GOOSE" build -q goose/cli.goose -o "$OUT/footy" >&2
echo "$OUT/footy"
