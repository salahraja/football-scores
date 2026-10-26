// Runs the data layer through each engine on the same input. Engines read raw JSON on stdin and print the
// static JSON, exactly like the TS reference in src/data/build.ts.
//   ts      : src/data/build.ts (the original logic; localeCompare)
//   goose   : the Goose CLI built by goose/build.sh, run in a clean environment (env -i, PATH only)
//   wasm    : the same Goose code compiled to wasm64 (goose/wasm/build.sh), loaded in-process by src/data/goose-wasm.ts
//   python  : python/footy.py, stdlib only (python3 -I)
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { loadGooseWasm } from "../src/data/goose-wasm.ts";
import { resultsData, serialize, standingsData } from "../src/data/build.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PY = join(HERE, "..", "python", "footy.py");
export const GOOSE_BIN = process.env.GOOSE_FOOTY ?? "/private/tmp/goose-spike/out/footy";
export const WASM_PATH = process.env.GOOSE_WASM ?? "/private/tmp/wasm-fs/goose-footy.wasm";
const wasm = existsSync(WASM_PATH) ? await loadGooseWasm(readFileSync(WASM_PATH)) : null;
const CLEAN = { PATH: "/usr/bin:/bin" };

export const available: Record<Engine, () => boolean> = {
  ts: () => true,
  goose: () => existsSync(GOOSE_BIN),
  wasm: () => wasm !== null,
  python: () => existsSync(PY),
};

function run(cmd: string, args: string[], input: string): string {
  const r = spawnSync(cmd, args, { input, env: CLEAN, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (${r.status}): ${r.stderr}`);
  return r.stdout.toString("utf8");
}

/** kind is "standings" or "results"; text is the raw JSON text. Returns the engine's output text. */
export type Engine = "ts" | "goose" | "wasm" | "python";
export type Kind = "standings" | "results";
export function runEngine(engine: Engine, kind: Kind, text: string): string {
  if (engine === "ts") {
    const v = JSON.parse(text);
    return serialize(kind === "results" ? resultsData(v) : standingsData(v));
  }
  if (engine === "wasm") return kind === "results" ? wasm!.results(text) : wasm!.standings(text);
  if (engine === "goose") return run(GOOSE_BIN, [kind], text);
  if (engine === "python") return run("python3", ["-I", PY, kind], text);
  throw new Error(`unknown engine ${engine as string}`);
}
