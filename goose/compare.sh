#!/bin/sh
# Builds the Goose CLI, runs the repo fixtures and a big synthetic season through TS and Goose,
# compares output byte for byte and times both. Usage: goose/compare.sh [rows]  (default 1000000)
# Needs: a built Goose compiler (GOOSE=/path/to/goose, default below) and Node >= 22.18 (runs .ts directly).
set -e
cd "$(dirname "$0")/.."
GOOSE=${GOOSE:-/private/tmp/goose-spike/goose/build/goose}
export GOOSE_HOME=${GOOSE_HOME:-/private/tmp/goose-home/.goose}
OUT=${OUT:-/private/tmp/goose-spike/out}
N=${1:-1000000}
mkdir -p "$OUT"
env -i PATH=/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin HOME=/private/tmp/goose-home GOOSE_HOME="$GOOSE_HOME" \
  "$GOOSE" build -q goose/table.goose -o "$OUT/table"
node goose/fixtures.mjs "$OUT/fx" "$N"
t() { python3 -c 'import subprocess,sys,time
best=1e9
for _ in range(3):
    t=time.perf_counter(); subprocess.run(sys.argv[1:],stdin=open(sys.argv[1+0] and sys.stdin.fileno() if False else 0),stdout=subprocess.DEVNULL,check=True); best=min(best,time.perf_counter()-t)
print("%.3fs"%best)' "$@"; }
fail=0
for pair in "table:repo-standings" "table:repo-ties" "rounds:repo-rounds" "table:big-standings" "rounds:big-rounds"; do
  mode=${pair%%:*}; f=${pair##*:}
  node goose/run_ts.mjs "$mode" < "$OUT/fx/$f.json" > "$OUT/$f.ts.out"
  "$OUT/table" "$mode" < "$OUT/fx/$f.json" > "$OUT/$f.goose.out"
  if cmp -s "$OUT/$f.ts.out" "$OUT/$f.goose.out"; then r=IDENTICAL; else r=DIFFERENT; fail=1; fi
  case $f in big-*) tts=$(python3 goose/bench.py "$OUT/fx/$f.json" node goose/run_ts.mjs "$mode"); tg=$(python3 goose/bench.py "$OUT/fx/$f.json" "$OUT/table" "$mode");; *) tts=-; tg=-;; esac
  echo "$f ($mode): $r  bytes=$(wc -c < "$OUT/$f.ts.out")  ts=$tts goose=$tg"
done
exit $fail
