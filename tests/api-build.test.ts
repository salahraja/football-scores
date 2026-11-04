import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { build, validate } from "../scripts/api/build.mjs";

// The API is a folder of static JSON (no server, no key in any app): /api/v1/competitions.json, /api/v1/<league>/<season>/{matches,table,
// teams}.json and /api/v1/meta.json. Built from saved openfootball files; a build that fails validation writes nothing.
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-api-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const read = (dir: string, path: string) => JSON.parse(readFileSync(join(dir, path), "utf8"));

describe("building the API", () => {
  it("writes every league's matches, table and teams, and says where the data came from", () => {
    const out = tmp();
    build({ input: "tests/fixtures/openfootball", out, seasons: ["2025-26"], now: "2026-10-31T03:00:00Z" });
    const competitions = read(out, "api/v1/competitions.json");
    expect(competitions.competitions.map((c: { id: string }) => c.id)).toEqual(["it-1", "en-1", "es-1", "de-1", "fr-1", "nl-1", "pt-1", "en-2"]);
    expect(competitions.competitions[0]).toMatchObject({ name: "Serie A", country: "Italy", seasons: ["2025-26"], current: "2025-26" });

    const table = read(out, "api/v1/it-1/2025-26/table.json");
    expect(table.table[0]).toMatchObject({ position: 1, team: "inter", points: 87 });
    const teams = read(out, "api/v1/it-1/2025-26/teams.json");
    expect(teams.teams.inter).toBeTruthy();
    const matches = read(out, "api/v1/pt-1/2025-26/matches.json");
    const fixed = matches.matches.find((m: { id: string }) => m.id === "pt-1:2026-05-16:casa-pia-rio-ave");
    expect(fixed).toMatchObject({ score: { ft: [1, 1] }, source: "correction" });
    expect(fixed.correctionSource).toMatch(/^https:\/\/en\.wikipedia\.org\//);

    const meta = read(out, "api/v1/meta.json");
    expect(meta).toMatchObject({ version: 1, generatedAt: "2026-10-31T03:00:00Z" });
    expect(meta.sources[0]).toMatchObject({ name: "openfootball", licence: "CC0-1.0" });
    expect(meta.leagues["it-1"]["2025-26"]).toMatchObject({ finished: 380, scheduled: 0, lastResult: "2026-05-24" });
    expect(meta.leagues["pt-1"]["2025-26"].corrections).toBe(2);
  });

  it("refuses to publish data that fails validation, and writes nothing", () => {
    const bad = { competition: "x", season: "2025-26", matches: [
      { id: "x:1", home: "a", away: "b", date: "2025-08-01", stage: "league", status: "finished", score: { ft: [1, -1], ht: null } },
      { id: "x:1", home: "a", away: "a", date: "2025-08-02", stage: "league", status: "finished", score: { ft: [0, 0], ht: null } },
    ] };
    const problems = validate(bad, { a: "A", b: "B" });
    expect(problems.join(" | ")).toMatch(/duplicate id x:1/);
    expect(problems.join(" | ")).toMatch(/plays itself/);
    expect(problems.join(" | ")).toMatch(/score/);

    const out = tmp();
    expect(() => build({ input: "tests/fixtures/openfootball", out, seasons: ["2025-26"], now: "2026-10-31T03:00:00Z",
      mutate: (season: { matches: { score: unknown }[] }) => { season.matches[0].score = { ft: [9, -2], ht: null }; } })).toThrow(/validation/);
    expect(existsSync(join(out, "api"))).toBe(false);
  });
});
