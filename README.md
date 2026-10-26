# Football Scores

A small static site for Serie A: a home page, a league table and match results.
Built with Vue 3, TypeScript, Vue Router and Vite, styled with plain CSS
(design tokens as custom properties in `src/styles/tokens.css`, light and dark
via `prefers-color-scheme`).

## Data

The pages show **sample data** (`src/data/sample.ts`), not live results. There is
no API key, no network call and no backend. Once a host and a data API are
chosen, replace the two functions in `src/data/index.ts`.

## Run

```bash
npm install
npm run dev        # dev server
npm run build      # type check, then build to dist/
npm run preview    # serve dist/
npm test           # vitest
npm run typecheck  # vue-tsc, the checker of record
```

`npm run typecheck:tsrs` runs the experimental `tsrs` checker. It does not
understand `.vue` files, so it is not a substitute for `vue-tsc`.

## Goose

The build-time data layer is written twice: in TypeScript (`src/data/helpers.ts`, `src/data/build.ts`, the original logic and the
reference) and in [Goose](https://aardappel.github.io/goose/docs/index.html) (`goose/footy.goose`). Goose is an experiment: about two
months old, one author, no package ecosystem. Nothing the app needs at run time depends on it.

### What is Goose and what is TS

| Piece | Language | Why |
|---|---|---|
| Table (points, tie-breaks, positions), results grouped by round with outcomes, name collation | Goose (`goose/footy.goose`) and TS (`src/data/build.ts`) | pure computation on JSON: the part Goose can do. Output is identical, byte for byte |
| Fetching data | none yet (the app shows sample data) | Goose has no HTTP. When a fetch step exists it is a shell script with curl writing `data/raw/*.json` |
| Vue app, router, views, tests, Vite | TS | Goose has no DOM and no JS interop |
| Calling Goose from the browser | `src/data/goose-wasm.ts` (60 lines) loading `goose-footy.wasm` | Goose has no WASM backend; this is a C to wasm64 workaround, see `docs/goose-spike.md`. Proven in Node only, not used by the app |

### Build and run (clean environment)

Goose is untrusted code. Every command below runs with an empty environment (`env -i`, `PATH` only): no tokens, no cloud credentials.

```sh
# 1. The Goose compiler, once (about 70 s; cmake via pip because it is not installed here)
python3 -m venv /private/tmp/goose-spike/venv && /private/tmp/goose-spike/venv/bin/pip install cmake
git clone --depth 1 https://github.com/aardappel/goose /private/tmp/goose-spike/goose
cd /private/tmp/goose-spike/goose
env -i PATH=/private/tmp/goose-spike/venv/bin:/usr/bin:/bin:/opt/homebrew/bin HOME=/private/tmp/goose-home cmake -B build -DCMAKE_BUILD_TYPE=Release
env -i PATH=/private/tmp/goose-spike/venv/bin:/usr/bin:/bin:/opt/homebrew/bin HOME=/private/tmp/goose-home cmake --build build -j8

# 2. This repo
npm ci
npm run goose:build           # goose/cli.goose -> /private/tmp/goose-spike/out/footy  (3 s)
npm run data                  # data/raw/*.json -> src/data/generated/*.json with Goose (falls back to TS, see below)
DATA_VERIFY=1 npm run data    # same, then fail unless the output is byte-identical to the TS engine
DATA_ENGINE=goose npm run data  # Goose or fail;  DATA_ENGINE=ts npm run data  # TS only
npm run build:data            # data, then a Vite build that reads the generated JSON (VITE_DATA=generated)
npm run parity                # every fixture in tests/fixtures through the Goose CLI and the wasm build vs TS
npm test                      # vitest (engine tests skip an engine that is not built)
npm run typecheck             # vue-tsc
```

Use another compiler location with `GOOSE=/path/to/goose`, another output with `OUT=/path`. Node 22.18 or newer is needed (scripts import `.ts` files directly).

### WASM (optional, experimental)

Needs the official [wasi-sdk](https://github.com/WebAssembly/wasi-sdk/releases) clang (only its clang and headers are used) under `/private/tmp/wasi-sdk`:
`wasi-sdk-34.0-arm64-macos.tar.gz`, 180,322,002 bytes, sha256 `9c59398106b417f8f14913380fdf0097a8cc0ff4af9eb3ce0065a859e88d49e9`
(the digest GitHub's release API lists for the asset; it matched `shasum -a 256` of the download). Then `npm run goose:wasm` writes
`/private/tmp/wasm-fs/goose-footy.wasm` (82 KB, 38 KB gzipped). It is wasm64 (memory64), so it needs Node 22+ or a browser with memory64
(not tested in browsers here). Inputs over 16 MB are refused by the loader because the wasm build has no overrun detection.

### The one switch and the fallback

`VITE_DATA=generated` makes the app read `src/data/generated/*.json`; without it the app computes everything in TS at load, as before.
`npm run data` (engine `auto`) builds the Goose CLI and uses it; if Goose cannot be built it prints a warning and runs the TS engine, so
a machine without Goose still produces the same files. `src/data/generated/` is not committed. If Goose is unavailable nothing breaks:
the default build never touches it, and `DATA_ENGINE=ts` gives the same JSON.

### Name order (the localeCompare difference)

The TS table breaks ties with `localeCompare` (ICU). Goose has no collation, and bytewise order differs for accents and case
(`zeta, Alpha, Émile` sorts `Alpha, Émile, zeta` in TS and `Alpha, zeta, Émile` bytewise). The documented rule, in `scripts/gen-collation.mjs`:
every character from U+0020 to U+017F has weights (primary, secondary, tertiary) taken from ICU (en-US) and stored in `data/collation.json`
(and as `goose/collation_table.goose`). Names compare by the primary sequence (base letter, shorter prefix first), then the secondary
(accents), then the tertiary (lower case before upper case), as ICU does. The generator checks the rule against `localeCompare` on 200,000
random strings (200,000 agree) and `tests/collation.test.ts` checks every pair of an accents/case corpus. Where it differs from ICU, by design:
characters ICU expands (ß Æ æ Œ œ Ĳ ĳ ŉ ſ, the fractions ¼ ½ ¾ and ¹ ² ³), NBSP and soft hyphen, anything above U+017F, and names that are not NFC
(decomposed accents). These sort after all table characters by code point. `tests/fixtures/outside-latin.standings.json` pins that behaviour
across engines.

