// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeSource } from "../src/data";

describe("describeSource (the words on the pages)", () => {
  it("live: says where and when", () => {
    expect(describeSource({ source: "live", fetchedAt: "2026-10-28T12:34:56.000Z", season: "2026-27" })).toBe(
      "Live from football-data.org, updated 2026-10-28",
    );
  });
  it("snapshot, missing or malformed meta: sample data", () => {
    expect(describeSource({ source: "snapshot" })).toBe("Sample data (saved snapshot)");
    expect(describeSource(undefined)).toBe("Sample data (saved snapshot)");
    expect(describeSource({ source: "live" })).toBe("Sample data (saved snapshot)");
  });
});

describe("scripts/write-meta.mjs", () => {
  const write = (rawMeta: string | null) => {
    const raw = mkdtempSync(join(tmpdir(), "fs-meta-raw-"));
    const out = mkdtempSync(join(tmpdir(), "fs-meta-out-"));
    if (rawMeta !== null) writeFileSync(join(raw, "meta.json"), rawMeta);
    execFileSync("node", ["scripts/write-meta.mjs", raw, out, "wasm"]);
    return JSON.parse(readFileSync(join(out, "meta.json"), "utf8"));
  };
  it("live raw meta is passed through with the engine added", () => {
    const live = { source: "live", fetchedAt: "2026-10-28T12:00:00.000Z", season: "2026-27" };
    expect(write(JSON.stringify(live))).toEqual({ ...live, engine: "wasm" });
  });
  it("snapshot, absent or broken raw meta all give snapshot", () => {
    expect(write('{"source":"snapshot"}')).toEqual({ source: "snapshot", engine: "wasm" });
    expect(write(null)).toEqual({ source: "snapshot", engine: "wasm" });
    expect(write("not json")).toEqual({ source: "snapshot", engine: "wasm" });
  });
});
