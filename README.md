# Football Scores

A small static site for Serie A: a home page, a league table and match results.
Built with Vue 3, TypeScript, Vue Router and Vite, styled with plain CSS
(design tokens as custom properties in `src/styles/tokens.css`, light and dark
via `prefers-color-scheme`).

## Data

The live site shows Serie A standings and results from [football-data.org](https://www.football-data.org/), fetched **at build
time** (there is no backend and no network call from the browser). `npm run build:live` does three steps:

1. `node scripts/fetch-data.mjs` (Node, no dependencies): with `FOOTBALL_DATA_TOKEN` set, two calls (`/v4/competitions/SA/standings`
   and `/matches`, header `X-Auth-Token`; the free tier allows 10 calls a minute) written to `data/raw/standings.json` and
   `data/raw/results.json`. With no token, or if the API fails (HTTP error, 429 after one retry, bad shape), it prints a warning,
   writes nothing and keeps the committed snapshot, so a build never fails for lack of data. The token is never printed or written.
2. `npm run data`: the Goose engine turns `data/raw` into `src/data/generated` (see Goose below). It runs with an empty environment,
   so it cannot see the token.
3. `VITE_DATA=generated npm run build`: Vite bundles the generated JSON into the site.

Early in a season, while there are zero finished matches, the fetch keeps the committed snapshot, so the previous season shows until
the first match finishes. A FINISHED match with a null score (or any other unexpected shape) also makes the whole fetch keep the snapshot.

The pages say where their data came from. The data step writes `src/data/generated/meta.json` (`source` is `live` or `snapshot`,
plus `fetchedAt` and `season` for live, and the `engine` used); the fetch records its source in `data/raw/meta.json`. The views show
"Live from football-data.org, updated <date>" or "Sample data (saved snapshot)", and "Sample data" on the plain dev path.

Without `VITE_DATA=generated` (plain `npm run dev` / `npm run build`) the app shows **sample data** (`src/data/sample.ts`).
Running the fetch locally overwrites the committed snapshot in `data/raw` (use `DATA_RAW=/some/dir` to write elsewhere); do not commit that.
Points are always `3 x wins + draws`, computed by the engines, so a points deduction in the API is not reflected.

## Deploy on Netlify

`netlify.toml` holds the build command, `dist` as the publish directory, a `/* -> /index.html` rewrite (the app uses history routing)
and a few security headers. Create the site from the repository, then add one environment variable (Site configuration, Environment
variables): **`FOOTBALL_DATA_TOKEN`** = your football-data.org API token. Without it the site builds from the committed snapshot.
New data appears on each deploy (trigger a deploy, or a Netlify build hook on a schedule).

Node: the build pins **Node 24** (`NODE_VERSION` in `netlify.toml`, `.nvmrc`, and `engines` `>=22.23` in `package.json`). The Goose wasm is
wasm64 (memory64): checked here, Node 22.18.0 refuses it (`invalid memory limits flags 0x4`), Node 22.23.4 and 24.22.2 run it by
default, and the data step plus the full `build:live` pipeline were run under 24.22.2. Netlify has no Goose compiler, so `auto`
picks the committed wasm there.

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

## Python

The same build-time data layer exists in plain Python, standard library only: `python/footy.py` (118 lines) and `python/test_footy.py`.
No packages, no `uv`, no virtualenv: just `python3` (3.9 or newer; developed on 3.14).

```sh
python3 -I python/footy.py standings < data/raw/standings.json > src/data/generated/standings.json
python3 -I python/footy.py results   < data/raw/results.json   > src/data/generated/results.json
npm run data                  # engine auto = native Goose, else the committed wasm, else Python, else TS (warning at each step down)
DATA_ENGINE=python DATA_VERIFY=1 npm run data   # also fail unless byte-identical to the TS engine
npm run test:python           # python3 -I -m unittest discover -s python  (compares with tests/golden = TS output)
node scripts/parity.mjs python
```

It uses the same collation rule as Goose (`data/collation.json`, see "Name order" below) so its bytes match TS and Goose on every
fixture. Goose is the default `auto` engine when its compiler is installed at `~/.local/share/goose-lang/build/goose` (a CMake build of github.com/aardappel/goose; set `GOOSE=` to use another path); then the committed wasm, then Python.

## Goose

The build-time data layer is written twice: in TypeScript (`src/data/helpers.ts`, `src/data/build.ts`, the original logic and the
reference) and in [Goose](https://aardappel.github.io/goose/docs/index.html) (`goose/footy.goose`). Goose is an experiment: about two
months old, one author, no package ecosystem. Nothing the app needs at run time depends on it.

### What is Goose and what is TS

| Piece | Language | Why |
|---|---|---|
| Table (points, tie-breaks, positions), results grouped by round with outcomes, name collation | Goose (`goose/footy.goose`) and TS (`src/data/build.ts`) | pure computation on JSON: the part Goose can do. Output is identical, byte for byte |
| Fetching data | Node (`scripts/fetch-data.mjs`) | Goose has no HTTP. The fetch writes `data/raw/*.json`; Goose never sees the token |
| Vue app, router, views, tests, Vite | TS | Goose has no DOM and no JS interop |
| Calling Goose from the browser | `src/data/goose-wasm.ts` (60 lines) loading `goose/dist/goose-footy.wasm` | Goose has no WASM backend; this is a C to wasm64 workaround, see `docs/goose-spike.md`. Used by Node at build time (`scripts/run-wasm.mjs`, `DATA_ENGINE=wasm`); not loaded by the browser app |

### Build and run (clean environment)

Goose is untrusted code. Every command below runs with an empty environment (`env -i`, `PATH` only): no tokens, no cloud credentials.

```sh
# 1. The Goose compiler, once (about 70 s; cmake via pip if it is not installed). Installed at ~/.local/share/goose-lang;
#    this repo was built and tested with github.com/aardappel/goose commit a108677d.
python3 -m venv ~/.cache/goose-venv && ~/.cache/goose-venv/bin/pip install cmake
git clone https://github.com/aardappel/goose ~/.local/share/goose-lang
cd ~/.local/share/goose-lang && git checkout a108677d
PATH=~/.cache/goose-venv/bin:$PATH cmake -B build -DCMAKE_BUILD_TYPE=Release && PATH=~/.cache/goose-venv/bin:$PATH cmake --build build -j8

# 2. This repo
npm ci
npm run goose:build           # goose/cli.goose -> ~/.cache/football-scores-goose/footy  (3 s)
npm run data                  # data/raw/*.json -> src/data/generated/*.json with the best engine available (see below)
DATA_VERIFY=1 npm run data    # same, then fail unless the output is byte-identical to the TS engine
DATA_ENGINE=goose npm run data  # native Goose or fail;  DATA_ENGINE=wasm  # the committed wasm or fail;  DATA_ENGINE=ts  # TS only
npm run build:data            # data, then a Vite build that reads the generated JSON (VITE_DATA=generated)
npm run build:live            # fetch from football-data.org first (needs FOOTBALL_DATA_TOKEN), then build:data
npm run parity                # every fixture in tests/fixtures through Python, the Goose CLI and the wasm build vs TS
npm test                      # vitest (engine tests skip an engine that is not built; the wasm is committed, so it always runs)
npm run typecheck             # vue-tsc
```

Use another compiler location with `GOOSE=/path/to/goose`, another output with `OUT=/path`. Node 22.18 or newer is needed to run the
scripts (they import `.ts` files directly); the wasm engine needs 22.23 or newer (see Deploy on Netlify).

### WASM engine (committed, used on Netlify)

`goose/dist/goose-footy.wasm` (82 KB) is the Goose data layer compiled to wasm64 (memory64) and **committed**, with
`goose/dist/goose-footy.wasm.sha256`. Any machine with Node 22.23+ can run Goose at build time without a Goose compiler:
`DATA_ENGINE=wasm npm run data` runs `scripts/run-wasm.mjs` with an empty environment. `auto` prefers native Goose, then this wasm,
then Python, then TS. `tests/wasm-committed.test.ts` fails if the file does not match its checksum, and `tests/engines.test.ts` and
`node scripts/parity.mjs wasm` fail if its output differs from the TS reference on any fixture. Inputs over 16 MB are refused by the
loader because the wasm build has no overrun detection. Not tested in browsers.

#### Rebuilding the wasm (only after changing `goose/*.goose`)

Needs two tools outside the repo, neither under `/tmp`:

- the Goose compiler (step 1 above), default path `~/.local/share/goose-lang/build/goose`, override with `GOOSE=`;
- the official [wasi-sdk](https://github.com/WebAssembly/wasi-sdk/releases) 34 (only its clang and headers are used), unpacked so that
  `~/.local/share/wasi-sdk/wasi-sdk-34.0-arm64-macos/bin/clang` exists, override with `SDK=`. The asset is
  `wasi-sdk-34.0-arm64-macos.tar.gz`, 180,322,002 bytes, sha256 `9c59398106b417f8f14913380fdf0097a8cc0ff4af9eb3ce0065a859e88d49e9`
  (the digest GitHub's release API lists for the asset; it matched `shasum -a 256` of the download). On another platform take the
  matching asset of the same release and point `SDK=` at it.

Then `npm run goose:wasm` rewrites `goose/dist/goose-footy.wasm` and its `.sha256` (scratch files go to `~/.cache/football-scores-wasm`,
override with `W=`; a missing tool stops with a message naming the variable to set). The build is **not** byte-reproducible: four rebuilds on one machine
gave four different sha256 values, all of which worked (cause unknown: Goose or clang, not investigated). So a rebuild is checked by
behaviour, not by hash: run `npm test` and `node scripts/parity.mjs wasm` (14/14), then commit the new wasm together with its new
`.sha256`. The `.sha256` file pins the committed artifact (the test catches a corrupted or half-updated file), not the build.

### The one switch and the fallback

`VITE_DATA=generated` makes the app read `src/data/generated/*.json`; without it the app computes everything in TS at load, as before.
`npm run data` (engine `auto`) uses native Goose if its compiler is installed, else the committed wasm, else Python, else TS; each step
down prints a warning, and every engine writes the same bytes. `src/data/generated/` is not committed.

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

