// Runs the committed Goose wasm (goose/dist/goose-footy.wasm) like the other CLIs: raw JSON on stdin, output on stdout.
//   node scripts/run-wasm.mjs standings|results < data/raw/standings.json > src/data/generated/standings.json
// Needs Node 22.23+ or 24+ (wasm64 / memory64 is on by default there); scripts/data.sh runs it with an empty environment.
import { readFileSync } from "node:fs";
import { loadGooseWasm } from "../src/data/goose-wasm.ts";

const kind = process.argv[2];
if (kind !== "standings" && kind !== "results") {
  console.error("usage: run-wasm.mjs standings|results < raw.json");
  process.exit(2);
}
const wasmPath = new URL("../goose/dist/goose-footy.wasm", import.meta.url);
try {
  const g = await loadGooseWasm(readFileSync(wasmPath));
  process.stdout.write(g[kind](readFileSync(0, "utf8")));
} catch (e) {
  console.error(`wasm engine: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
