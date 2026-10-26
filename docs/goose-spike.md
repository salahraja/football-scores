# Goose spike (2026-10-26)

Question: where can the Goose language be used in football-scores today? Branch `goose-spike`, nothing pushed.

## Result in one line
`buildTable` and `groupByRound` from `src/data/helpers.ts` run as a Goose CLI and match the TS output byte for byte on the repo's own fixtures and on a 1,000,000-row synthetic season. It is a proof, not something the app can load today.

## Build (clean env, in /private/tmp/goose-spike)
- Goose commit a108677 (2026-10-25), Apache-2.0. Built per README: `cmake -B build -DCMAKE_BUILD_TYPE=Release` then `cmake --build build -j8`. About 70 s, 5 compiler warnings, no errors.
- cmake was not installed; `pip install cmake` into a venv under /private/tmp/goose-spike/venv (cmake 4.4.4). Apple clang 21.0.0, macOS arm64. Built without `GOOSE_BUILTIN_LIBS` (no gfx packages, no git fetch).
- Programs run in-process (`goose run f.goose`) or build to a native exe (`goose build`, which needs the system C compiler).

## What the language supports (tested or read in docs/stdlib)
- Tested here: stdin (`os::read_stdin`), JSON parse (`json::parse`, serde_json-style number output), string output with `format`/`json::format_string`, `stable_sort` with a comparator block, bytewise `compare`, structs, slices.
- Present in stdlib, not used here: CSV (`csv::each_record`), regex, base64, dictionary, threads, files.
- Calling C: `extern fn` works. Being called from C: `export fn` plus `goose --standalone --header x.h -o x.c f.goose`. Proven: `goose/cabi_demo.sh` builds a .dylib with `clang -dynamiclib` and calls it through Python ctypes.
- WASM: not implemented. `docs/design/wasm.md` in the Goose repo says "a proposal and is not implemented". So a Vue app cannot load Goose code in the browser today.
- HTTP, Postgres, Python interop: none documented, none tried.
- Rough edges met: one error because `abort` takes one argument (the compiler message was clear). Everything else compiled first time after that.

## Parity and speed
Run: `goose/compare.sh` (default 1,000,000 rows). Whole-process wall time, best of 3, includes JSON parse and print. Apple silicon Mac, one machine, one run of the script.

| fixture | output | TS (node 26) | Goose |
|---|---|---|---|
| repo sample standings, tie test, rounds | identical | n/a | n/a |
| 1M standings rows (130 MB output) | identical | 2.22 s | 1.28 s |
| 1M events grouped by round | identical | 0.68 s | 0.12 s |

Caveats: the TS side includes node start-up and `localeCompare`, which is far slower than a bytewise compare; the repo never has more than about 20 teams, so real use costs microseconds and the speed gain is irrelevant to users. The synthetic season is shaped for ties and duplicate names on purpose.

Known behaviour difference: TS sorts names with `localeCompare` (ICU); Goose compares bytes. They match for plain same-case ASCII names (all fixtures) but differ for mixed case and accents. Example: `zeta, Alpha, Émile` gives `Alpha, Émile, zeta` in TS and `Alpha, zeta, Émile` in Goose. A real port would need a collation rule, or a data-side sort key.

## How it could be wired in, and what is missing
1. Build-time generator: run the Goose CLI during `vite build` to precompute static JSON (for example a season table from results). Works today. The app is a static site, so this fits, but only if there is real data to precompute.
2. C ABI behind a Node addon or Python: works (see demo), but the browser cannot use it, and a native addon needs per-platform builds.
3. WASM in the browser: missing in Goose. Nothing to wire.
The data fetch and web layer (fetching scores, Vue, router, tests) stay TypeScript. Goose has no HTTP and no DOM.

## Risks
- Created 2026-08-30; about eight weeks old. One main author; bus factor 1. The compiler is large C++ (about 30k lines, and the author says Goose is new).
- Benchmarks are the author's own (repo bench/results.md); not reproduced here.
- No package ecosystem, no Vue/TS interop, whole-program compilation only (no libraries of Goose code), no WASM.
- The TS version is 27 lines with tests; Goose adds a second language, a compiler to install, and a localeCompare gap, for no user-visible gain.

## Verdict
Goose fits football-scores today only as an optional build-time or CLI tool for heavy pure computation. For the current logic there is no reason to adopt it. Revisit when Goose ships WASM output.

## Reproduce
```
python3 -m venv /private/tmp/goose-spike/venv && /private/tmp/goose-spike/venv/bin/pip install cmake
git clone --depth 1 https://github.com/aardappel/goose /private/tmp/goose-spike/goose
cd /private/tmp/goose-spike/goose
env -i PATH=/private/tmp/goose-spike/venv/bin:/usr/bin:/bin:/opt/homebrew/bin HOME=/private/tmp/goose-home cmake -B build -DCMAKE_BUILD_TYPE=Release
env -i PATH=/private/tmp/goose-spike/venv/bin:/usr/bin:/bin:/opt/homebrew/bin HOME=/private/tmp/goose-home cmake --build build -j8
cd ~/football-scores-worktrees/goose-spike
PATH=/usr/bin:/bin:/opt/homebrew/bin goose/compare.sh      # parity + timing
PATH=/usr/bin:/bin:/opt/homebrew/bin goose/cabi_demo.sh    # C ABI proof
```
Files: `goose/table.goose`, `goose/fixtures.mjs`, `goose/run_ts.mjs`, `goose/compare.sh`, `goose/bench.py`, `goose/export_demo.goose`, `goose/cabi_demo.sh`. Node 22.18+ is needed to import the .ts helpers directly.
