// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv/dist/2020";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";

// What the iPhone app and its widget need beyond the web pages (docs/research/2026-11-04-results-source-and-app-api.md section 5):
// kick-off as an absolute time, one small file of the games around today, and the table zones.
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-app-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const schema = JSON.parse(readFileSync("data/api/schema.json", "utf8"));
const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
ajv.addSchema(schema);
const valid = (def: string, body: unknown) => (ajv.validate(`${schema.$id}#/$defs/${def}`, body) ? [] : ajv.errors!.map((e) => `${e.instancePath} ${e.message}`));

// the 2025-26 fixtures with Serie A's last matchday not yet played, built `daysBefore` days ahead of it
const around = (daysBefore: number, zones?: unknown) => {
  const input = tmp(), out = tmp();
  for (const code of ["it.1", "en.1"]) {
    const season = JSON.parse(readFileSync(`tests/fixtures/openfootball/2025-26/${code}.json`, "utf8"));
    if (code === "it.1") { const last = season.matches.at(-1).date; for (const m of season.matches) if (m.date === last) delete m.score; }
    mkdirSync(join(input, "2025-26"), { recursive: true });
    writeFileSync(join(input, "2025-26", `${code}.json`), JSON.stringify(season));
  }
  const last = JSON.parse(readFileSync("tests/fixtures/openfootball/2025-26/it.1.json", "utf8")).matches.at(-1).date as string;
  const now = new Date(Date.parse(`${last}T09:00:00Z`) - daysBefore * 86_400_000).toISOString();
  build({ input, wikipedia: tmp(), out, seasons: ["2025-26"], now, ...(zones ? { zones } : {}) });
  const read = (p: string) => JSON.parse(readFileSync(join(out, "api/v1", p), "utf8"));
  return { read, last, today: now.slice(0, 10) };
};

describe("the API for the app", () => {
  it("gives every match its kick-off as an absolute time in the league's own time zone, or null without a time", () => {
    const { read } = around(1);
    for (const [league, summer, winter] of [["it-1", "+02:00", "+01:00"], ["en-1", "+01:00", "+00:00"]]) {
      const { matches } = read(`${league}/2025-26/matches.json`);
      for (const m of matches) {
        if (!m.time) { expect(m.kickoff, m.id).toBeNull(); continue; }
        const month = Number(m.date.slice(5, 7));
        const offset = month >= 4 && month <= 9 ? summer : month === 11 || month === 12 || month <= 2 ? winter : null;
        expect(m.kickoff.startsWith(`${m.date}T${m.time}:00`), m.id).toBe(true);
        if (offset) expect(m.kickoff.endsWith(offset), m.id).toBe(true);
      }
    }
  });

  it("writes today.json: every league's games from yesterday to three days ahead, with team names, in kick-off order", () => {
    const { read, last, today } = around(1);
    const t = read("today.json");
    expect(valid("today", t)).toEqual([]);
    expect(t.from < today && t.to > today).toBe(true);
    expect(t.matches.length).toBeGreaterThan(0);
    for (const m of t.matches) {
      expect(m.date >= t.from && m.date <= t.to, m.id).toBe(true);
      expect(typeof m.homeName).toBe("string");
      expect(["it-1", "en-1"]).toContain(m.league);
    }
    expect(t.matches.some((m: any) => m.league === "it-1" && m.date === last && m.status === "scheduled")).toBe(true);
    const keys = t.matches.map((m: any) => (m.kickoff ?? m.date) + m.id);
    expect(keys).toEqual([...keys].sort());
  });

  it("is listed in meta.files, and the matches still fit the schema", () => {
    const { read } = around(1);
    expect(Object.keys(read("meta.json").files)).toContain("api/v1/today.json");
    expect(valid("matches", read("it-1/2025-26/matches.json"))).toEqual([]);
  });

  it("puts the season's zones in table.json when there are any, and none otherwise", () => {
    const zones = (season: string, id: string) => (id === "it-1" ? { zones: [{ kind: "cl", from: 1, to: 4 }], note: "A note." } : null);
    const { read } = around(1, zones);
    const it1 = read("it-1/2025-26/table.json");
    expect(it1.zones).toEqual({ zones: [{ kind: "cl", label: "Champions League", from: 1, to: 4 }], note: "A note." });
    expect(valid("table", it1)).toEqual([]);
    expect(read("en-1/2025-26/table.json").zones).toBeNull();
  });
});
