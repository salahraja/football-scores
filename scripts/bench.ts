// Build/run speed of every engine on a large synthetic season, with a byte-identity check against the TS reference.
//   node scripts/bench.ts [factor=100] [runs=5]
// factor 100 = 100 seasons: 2,000 table rows and 38,000 events (7.6 MB of results JSON).
// Process engines are timed end to end (process start, parse, compute, print); TS is timed in-process after
// start-up too, so a fair TS number is "node start + load" (printed separately); wasm is timed in-process
// after its one-off load (time to instantiate printed separately).
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { available, runEngine, type Engine, type Kind } from "./engines.ts";

const factor = process.argv[2] ?? "100";
const runs = Number(process.argv[3] ?? 5);
const dir = mkdtempSync(join(tmpdir(), "fs-bench-"));
execFileSync("node", ["scripts/big-season.mjs", dir, factor], { stdio: "ignore" });

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const engines = (["ts", "goose", "wasm", "python"] as Engine[]).filter((e) => available[e]());
console.log(`factor ${factor}, median of ${runs} runs, ms (standings / results), identical to TS?`);
for (const e of engines) {
  const row: string[] = [];
  let same = true;
  for (const kind of ["standings", "results"] as Kind[]) {
    const text = readFileSync(`${dir}/${kind}.json`, "utf8");
    const want = runEngine("ts", kind, text);
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now();
      const got = runEngine(e, kind, text);
      times.push(performance.now() - t0);
      if (i === 0 && got !== want) same = false;
    }
    row.push(median(times).toFixed(1));
  }
  console.log(`${e.padEnd(7)} ${row.join(" / ").padEnd(16)} ${same ? "identical" : "DIFFERENT"}`);
}
// What `npm run data` actually pays: whole processes, both files, wall time (start-up included).
const out = mkdtempSync(join(tmpdir(), "fs-bench-out-"));
const goose = process.env.GOOSE_FOOTY ?? "/private/tmp/goose-spike/out/footy";
const cli: Record<string, string> = {
  ts: `node scripts/gen-ts.mjs ${dir} ${out}`,
  goose: `env -i PATH=/usr/bin:/bin ${goose} standings < ${dir}/standings.json > ${out}/s.json && env -i PATH=/usr/bin:/bin ${goose} results < ${dir}/results.json > ${out}/r.json`,
  python: `python3 -I python/footy.py standings < ${dir}/standings.json > ${out}/s.json && python3 -I python/footy.py results < ${dir}/results.json > ${out}/r.json`,
};
console.log(`whole processes, both files, median of ${runs} (ms):`);
for (const e of ["ts", "goose", "python"] as Engine[]) {
  if (!available[e]()) continue;
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    execFileSync("sh", ["-c", cli[e]], { stdio: "ignore" });
    times.push(performance.now() - t);
  }
  console.log(`${e.padEnd(7)} ${median(times).toFixed(0)}`);
}
// Start-up: how long a bare process takes, so process engines can be read net of it.
const t0 = performance.now();
for (let i = 0; i < runs; i++) spawnSync("/usr/bin/true");
console.log(`(bare process spawn: ${((performance.now() - t0) / runs).toFixed(1)} ms; node itself starts in ~40 ms)`);
