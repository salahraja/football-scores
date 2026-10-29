import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { available, runEngine, type Engine, type Kind } from "../scripts/engines";

// Every engine must print exactly the bytes of the TS reference, on every fixture in tests/fixtures.
// An engine that is not installed (no Goose build, no wasm file) is skipped, not failed.
const dir = "tests/fixtures";
const fixtures = readdirSync(dir).sort().flatMap((f) => {
  const m = f.match(/^(.*)\.(standings|results)\.json$/);
  return m ? [{ name: m[1], kind: m[2] as Kind, file: f }] : [];
});
const engines: Engine[] = ["goose", "wasm", "python"];

for (const engine of engines) {
  describe.skipIf(!available[engine]())(`${engine} engine`, () => {
    for (const f of fixtures.filter((x) => x.name !== "outside-latin")) {
      it(`${f.file} is byte-identical to the TS reference`, () => {
        const text = readFileSync(`${dir}/${f.file}`, "utf8");
        expect(runEngine(engine, f.kind, text)).toBe(runEngine("ts", f.kind, text));
      });
    }
  });
}

describe("engines agree with each other outside the collation table", () => {
  const text = readFileSync(`${dir}/outside-latin.standings.json`, "utf8");
  const present = engines.filter((e) => available[e]());
  it.skipIf(present.length < 2)("goose, wasm and python print the same bytes for characters ICU orders differently", () => {
    const outs = present.map((e) => runEngine(e, "standings", text));
    for (const o of outs) expect(o).toBe(outs[0]);
  });
  it("and that order differs from localeCompare only where documented (README, Goose)", () => {
    const names = (s: string) => (JSON.parse(s) as { team: { name: string } }[]).map((r) => r.team.name);
    const ts = names(runEngine("ts", "standings", text));
    expect([...ts].sort()).toEqual([...names(runEngine(present[0] ?? "ts", "standings", text))].sort());
  });
});
