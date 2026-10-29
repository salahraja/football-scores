// The committed wasm (goose/dist) must be the build its checksum file names, and must print the TS engine's bytes.
// (tests/engines.test.ts already runs every fixture through it; this one fails loudly if the file is missing or stale.)
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runEngine } from "../scripts/engines";

const wasm = "goose/dist/goose-footy.wasm";

describe("committed wasm engine", () => {
  it("exists and matches goose/dist/goose-footy.wasm.sha256", () => {
    expect(existsSync(wasm)).toBe(true);
    const want = readFileSync(`${wasm}.sha256`, "utf8").split(/\s+/)[0];
    expect(createHash("sha256").update(readFileSync(wasm)).digest("hex")).toBe(want);
  });
  for (const kind of ["standings", "results"] as const) {
    it(`prints the TS reference's bytes for the sample ${kind}`, () => {
      const text = readFileSync(`data/raw/${kind}.json`, "utf8");
      expect(runEngine("wasm", kind, text)).toBe(runEngine("ts", kind, text));
    });
  }
});
