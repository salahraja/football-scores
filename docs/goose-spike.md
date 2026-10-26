# Goose spike (2026-10-26)

**Update (branch `goose-football`):** the spike below found "no WASM, nothing to wire". A workaround exists: Goose's own C output compiles to
wasm64 with a 95-line freestanding shim and a 49-line patch to the generated C, and the data layer now runs three ways with identical bytes. See
"Workaround: C to WASM" and "Goose bug and limitation log" at the end. The text from here to "Reproduce" is the original spike.

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

---

# Update: building the data layer in Goose (branch goose-football)

## What was built
- `goose/footy.goose` (159 lines): standings (points, wins, collation key, positions) and results (rounds newest first, outcome per event) as JSON in, JSON out. `goose/cli.goose` is the CLI; `goose/wasm_entry.goose` is the C-ABI wrapper for wasm.
- `src/data/build.ts` is the TS reference (calls the original `buildTable`/`groupByRound`/`outcome`). `scripts/engines.ts` runs any engine; `scripts/parity.mjs` and `tests/engines.test.ts` compare every engine with the reference on the 15 fixtures in `tests/fixtures` (sample data, ties, points-then-wins, duplicates, zeros, empty, JSON escapes, accents and case, rounds). Result: Goose CLI 14/14 identical, wasm 14/14 identical (outside-latin is pinned engine to engine, not to ICU).
- Real finding fixed: localeCompare vs bytes. Rule and numbers in README "Name order". Before the fix the accents/case fixtures differed; after it they match, 200,000/200,000 random strings agree with ICU.
- The app has a switch (`VITE_DATA=generated`) and `npm run data` with a TS fallback.

## Workaround: C to WASM (it works, with a caveat that matters)
Steps that were needed, in the order they failed:
1. Apple clang has the wasm32 target but no `wasm-ld`; Homebrew has no llvm/lld. Downloaded the official **wasi-sdk 34** release asset `wasi-sdk-34.0-arm64-macos.tar.gz` from github.com/WebAssembly/wasi-sdk (180,322,002 bytes; sha256 `9c59398106b417f8f14913380fdf0097a8cc0ff4af9eb3ce0065a859e88d49e9`, which equals the `digest` the GitHub releases API lists for that asset). Extracted to `/private/tmp/wasi-sdk` (606 MB). Nothing else was installed.
2. `goose --standalone --header x.h -o x.c` gives one C file with the runtime inside. Compiling it for `wasm32-wasip1` fails on: `setjmp.h` (needs the exception-handling proposal), `sys/mman.h` (no mmap), `signal.h` (`sigaction`, `siginfo_t`, `sigaltstack`, `SIGSEGV`). That is the runtime's OS layer: each data stack is an mmap'd region with a guard gap and a SIGSEGV handler that commits pages (macOS) or reports overrun.
3. `goose/wasm/patch_c.py` adds a `__wasm__` branch to that layer: stack regions from `calloc`, no fault handler, no signal stack, setjmp stubs. Marker-based text patching (`#else  /* posix */`, `#include <setjmp.h>`); it asserts the markers exist, so a Goose upgrade that moves them fails loudly.
4. wasm32 then compiles and links (243 KB with wasi-libc) and runs, **but returns wrong answers without any error**: `json::as_string` and `json::as_i64` report "not a string / not an integer" on valid input. Cause: Goose lays out records for 8-byte pointers (a slice is `{ptr, i64 len}`, 16 bytes) and emits packed structs, while wasm32 pointers are 4 bytes, so the packed C struct is 12 bytes and the compiler's own offsets no longer match. `/private/tmp/gf/dbg` repro below. Native build of the same patched C is correct (10747); wasm32 gives 3.
5. wasm64 (memory64) has 8-byte pointers and so matches. wasi-sdk ships no wasm64 libc, but the generated C needs only: `malloc calloc free _Exit strlen fflush fwrite setvbuf fprintf snprintf vsnprintf frexp ldexp` and the `stdout`/`stderr` symbols. `goose/wasm/shim64.c` (95 lines) provides them: a bump allocator (free is a no-op), a small printf for `%s %d %u %x %c %p`, and two host imports (`host_write`, `host_exit`). Float printing is not supported (not used here). Result: 82,210 bytes (37,790 gzipped), exports `goose_init, malloc, fs_in_reserve, fs_in_ptr, fs_out_ptr, fs_run`.
6. `src/data/goose-wasm.ts` (63 lines, no dependencies): instantiate, `goose_init(0,0)`, copy UTF-8 JSON into linear memory at `fs_in_ptr`, `fs_run(mode)`, read the output. Pointers and lengths are BigInt on the JS side under memory64.

Limits found by testing:
- **No overrun detection.** Data stacks are 32 MB regions without guard pages. A 12 MB input (100,000 rows) is correct, a 36 MB input (300,000 rows) returns garbage text, 123 MB traps out of bounds. The loader refuses inputs over 16 MB. Football data is nowhere near that (the 100x season is 7.6 MB).
- **memory64 in browsers is untested here.** Node 26 runs it. Support in browsers is recent; check before shipping. A wasm32 build is not possible until Goose emits 4-byte-pointer layouts.
- Size: 82 KB wasm vs. nothing (the TS logic is a few hundred bytes of JS). No speed benefit that a user would notice.
- It is a workaround on generated text, not a supported target. Goose's own `docs/design/wasm.md` still says "a proposal and is not implemented".

Repro for step 4 (minimal; run natively it prints 10747, in wasm32 it prints 3):
```goose
import std; import json;
export "dbg" fn dbg(which: i32) -> i64 {
    var doc: json::Node[>..] = []; var decoded: u8[>..] = [];
    let root, err = json::parse("{\"a\":{\"name\":\"x\",\"n\":5},\"id\":7}", doc, decoded);
    guard root else { return -1; }
    var r: i64 = 0;
    let a = json::member(root, "a");  if a { r += 1; }
    let nm = json::member(a, "name"); if nm { r += 2; }
    let s, ok = json::as_string(nm);  if ok { r += 4; }          // wasm32: false
    let n, ok2 = json::as_i64(json::member(a, "n")); if ok2 { r += 8 * n; }   // wasm32: false
    return r;
}
```
Build: `goose -q --standalone --header d.h -o d.c dbg.goose`, patch with `goose/wasm/patch_c.py`, then `clang --target=wasm32-wasip1 ... -mexec-model=reactor` vs `--target=wasm64-unknown-wasi ... -nostdlib` plus the shim.

## Numbers (one Apple silicon Mac, the machine was under heavy load from other jobs, load average 90, so treat times as rough)
Run `node scripts/bench.ts 100 5`. 100x season = 2,000 table rows and 38,000 events (7.6 MB).
See the decision table in the final report for the final figures; every engine's output was byte-identical to the TS reference on this input.
- Goose native binary: 143 KB, builds in about 3 s. Goose to wasm: about 4 s. Compiler build: 70 s once.
- Per-call in-process (after load): wasm about 3-10 ms standings / 40-85 ms results; TS 6-10 ms / 155-250 ms (includes localeCompare); the whole-process CLI times are in the bench output.

## Goose bug and limitation log (for a possible upstream report; nothing filed)
Compiler commit a108677. Each has a minimal repro.

1. **wasm32 silently miscompiles layouts** (above). Layouts assume 8-byte pointers; compiling the C for a 4-byte-pointer target gives wrong results, not an error. Expected: a compile-time `#error`/static assert on `sizeof(void*) != 8`.
2. **No wasm output; the runtime cannot be told to skip its OS layer.** The OS layer is chosen with `#ifdef _WIN32 ... #else posix`. A hook such as `GS_PLATFORM_CUSTOM`, or a documented list of the functions a port must supply (`gs_os_reserve`, `gs_release_region`, `gs_os_page_size`, `gs_regions_init`, `gs_native_stack_init/free`, `gs_end_first`, `gs_park`, `madvise` use in `gs_trim_memory`), would remove the text patching.
3. **`return` inside a trailing block returns from the enclosing function**, and the type error is reported inside the stdlib:
   ```goose
   import std;
   fn main() { var v: i64[>..] = [3, 1, 2];
     stable_sort(v) { a, b => if a != b { return a < b; } return false; };   // error: std.goose:530: ! requires bool, got void
   }
   ```
   The message names `std.goose:530` and the instantiation chain; the cause is in the user's block. A comparator needing early exit has to be a named function.
4. **`as` is a keyword and cannot be a field name** (`struct S { as: i64 }` -> "expected identifier in struct body, found 'as'"). Legit, but `as` is common in data (away score). The message is clear.
5. **`resize(n)` without a fill value type-checks and fails at run time:** `var a: u8[>..] = []; a.resize(3);` -> `goose runtime error: resize growth requires a fill value`. Could be a compile error when the length is not known to shrink.
6. **`goose build -q` prints `built <path>` on stdout** although `-q` says it prints nothing on success; scripts capturing the output path must redirect it.
7. **`import .x` resolves relative to the importing file but `import x` relative to the root file's directory;** an entry file in a subfolder cannot import a sibling's parent. Not a bug, but it forced `goose/wasm_entry.goose` to sit next to `footy.goose`.
8. **No collation or Unicode normalisation in the stdlib** (case folding is ASCII only): the localeCompare gap above. Worked around with a generated table.
9. **No overrun check on any platform without mmap** (see Limits): an input larger than the region silently corrupts. The doc `docs/design/wasm.md` section 2 calls for growth checks; they are not there yet.
10. Diagnostics: the first error of a program with several mistakes in a generic call chain prints the stdlib frame first (item 3); otherwise error text was good.

