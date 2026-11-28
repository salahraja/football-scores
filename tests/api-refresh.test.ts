import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decide, digests, named, sourcesFailed } from "../scripts/api/refresh.mjs";

// The site is static: a result only shows after a build. The job that was meant to rebuild it every four hours needed a secret nobody
// had set (found 2026-11-17: no secret in the repo, no build hook on the site), so tables only moved when code was pushed. This job
// needs no secret: it builds the data, and commits a small file of digests only when the facts changed. The push is what makes the
// host build. Netlify's free plan has 300 build minutes a month and stops building past them, so the rebuilds are capped.

const HOUR = 3_600_000;
const at = (iso: string) => new Date(iso);
const state = (over: Record<string, unknown> = {}) => ({
  files: { "it-1/2026-27/matches.json": "aaa", "it-1/2026-27/table.json": "bbb" },
  changedAt: "2026-11-18T06:00:00.000Z", day: "2026-11-18", buildsToday: 1, ...over,
});

describe("digests: only the facts are compared", () => {
  it("reads matches, tables and groups, and leaves out the files that change with the clock", () => {
    const dir = mkdtempSync(join(tmpdir(), "refresh-"));
    for (const [path, body] of Object.entries({
      "it-1/2026-27/matches.json": '{"matches":[1]}', "it-1/2026-27/table.json": '{"table":[]}', "it-1/2026-27/teams.json": "{}",
      "afcon/2026-27/groups.json": '{"groups":[]}', "today.json": '{"generatedAt":"now"}', "meta.json": '{"generatedAt":"now"}',
    })) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), body);
    }
    const got = digests(dir);
    expect(Object.keys(got).sort()).toEqual(["afcon/2026-27/groups.json", "it-1/2026-27/matches.json", "it-1/2026-27/table.json"]);
    expect(got["it-1/2026-27/matches.json"]).toMatch(/^[0-9a-f]{64}$/);
    writeFileSync(join(dir, "today.json"), '{"generatedAt":"later"}');
    expect(digests(dir)).toEqual(got);
    writeFileSync(join(dir, "it-1/2026-27/matches.json"), '{"matches":[1,2]}');
    expect(digests(dir)["it-1/2026-27/matches.json"]).not.toBe(got["it-1/2026-27/matches.json"]);
  });
});

describe("decide: when the site is rebuilt", () => {
  it("rebuilds the first time, when nothing has been recorded yet", () => {
    const got = decide(null, state().files, at("2026-11-18T07:00:00Z"));
    expect(got.rebuild).toBe(true);
    expect(got.next).toMatchObject({ files: state().files, day: "2026-11-18", buildsToday: 1, changedAt: "2026-11-18T07:00:00.000Z" });
  });

  it("does nothing when the facts are the same and the site was built today", () => {
    const got = decide(state(), state().files, at("2026-11-18T09:00:00Z"));
    expect(got).toMatchObject({ rebuild: false, changed: [] });
    expect(got.why).toMatch(/nothing changed/);
  });

  it("rebuilds when a result came in, and says which files moved", () => {
    const files = { ...state().files, "it-1/2026-27/matches.json": "ccc" };
    const got = decide(state(), files, at("2026-11-18T09:00:00Z"));
    expect(got.rebuild).toBe(true);
    expect(got.changed).toEqual(["it-1/2026-27/matches.json"]);
    expect(got.next).toMatchObject({ files, buildsToday: 2, day: "2026-11-18" });
  });

  it("counts a new file as a change", () => {
    expect(decide(state(), { ...state().files, "afcon/2026-27/groups.json": "ddd" }, at("2026-11-18T09:00:00Z")).changed).toEqual(["afcon/2026-27/groups.json"]);
  });

  it("does not count a file that is gone: a league whose download failed is missing, not changed", () => {
    const got = decide(state(), { "it-1/2026-27/table.json": "bbb" }, at("2026-11-18T09:00:00Z"));
    expect(got).toMatchObject({ rebuild: false, changed: [] });
    // and its digest is kept, so the next good run compares with the last good build
    const later = decide(state(), { "it-1/2026-27/table.json": "ccc" }, at("2026-11-18T09:00:00Z"));
    expect(later.next?.files).toEqual({ "it-1/2026-27/matches.json": "aaa", "it-1/2026-27/table.json": "ccc" });
  });

  it("does not compare results on a run where a source did not download", () => {
    const files = { ...state().files, "it-1/2026-27/matches.json": "ccc" };  // fewer results filled in, because Wikipedia was down
    const got = decide(state(), files, at("2026-11-18T09:00:00Z"), { sourcesOk: false });
    expect(got).toMatchObject({ rebuild: false, changed: [] });
    expect(got.why).toMatch(/did not download/);
  });

  it("still rebuilds once on a new day when a source is down, and keeps the last good digests", () => {
    const files = { ...state().files, "it-1/2026-27/matches.json": "ccc" };
    const got = decide(state(), files, at("2026-11-19T00:30:00Z"), { sourcesOk: false });
    expect(got.rebuild).toBe(true);
    expect(got.next).toMatchObject({ files: state().files, day: "2026-11-19", buildsToday: 1 });
  });

  it("records nothing on a first run where a source is down", () => {
    expect(decide(null, state().files, at("2026-11-18T09:00:00Z"), { sourcesOk: false })).toMatchObject({ rebuild: false, next: null });
  });

  it("waits when the last rebuild was a moment ago, so a burst of edits is one build", () => {
    const files = { ...state().files, "it-1/2026-27/table.json": "ccc" };
    const got = decide(state(), files, at("2026-11-18T06:20:00Z"));
    expect(got.rebuild).toBe(false);
    expect(got.why).toMatch(/waiting/);
    expect(decide(state(), files, at("2026-11-18T06:50:00Z")).rebuild).toBe(true);  // 45 minutes on, it goes
  });

  it("stops at the day's cap, so the free build minutes cannot run out", () => {
    const files = { ...state().files, "it-1/2026-27/table.json": "ccc" };
    const got = decide(state({ buildsToday: 8 }), files, at("2026-11-18T20:00:00Z"));
    expect(got.rebuild).toBe(false);
    expect(got.why).toMatch(/cap/);
  });

  it("starts the count again on a new day", () => {
    const files = { ...state().files, "it-1/2026-27/table.json": "ccc" };
    const got = decide(state({ buildsToday: 8 }), files, at("2026-11-19T00:30:00Z"));
    expect(got.rebuild).toBe(true);
    expect(got.next).toMatchObject({ day: "2026-11-19", buildsToday: 1 });
  });

  it("rebuilds once on a new day even when no result changed, because each page lists this week's games", () => {
    const got = decide(state(), state().files, at("2026-11-19T00:30:00Z"));
    expect(got).toMatchObject({ rebuild: true, changed: [] });
    expect(got.why).toMatch(/new day/);
    expect(decide(got.next, state().files, at(new Date(Date.parse("2026-11-19T00:30:00Z") + 2 * HOUR).toISOString())).rebuild).toBe(false);
  });

  it("can be told to rebuild whatever the facts say", () => {
    expect(decide(state(), state().files, at("2026-11-18T06:05:00Z"), { force: true }).rebuild).toBe(true);
  });
});

describe("sourcesFailed: reading what the downloads said", () => {
  it("is true when a download kept its saved copy, false when everything was saved", () => {
    expect(sourcesFailed("openfootball: saved 16\nwikipedia: saved 13\n")).toBe(false);
    expect(sourcesFailed("openfootball: saved 15; kept the saved copy of 2026-27/en.1.json (HTTP 503)\nwikipedia: saved 13\n")).toBe(true);
    expect(sourcesFailed("openfootball: saved 16\n")).toBe(true);   // the Wikipedia line is missing: that download never ran or died
    expect(sourcesFailed("")).toBe(true);
  });
});

describe("named: what the commit says changed", () => {
  it("names each competition once, by the name people know it by", () => {
    const names = { "it-1": "Serie A", "uefa-champions-league": "Champions League" };
    expect(named(["it-1/2026-27/matches.json", "it-1/2026-27/table.json", "uefa-champions-league/2026-27/groups.json"], names)).toBe("Serie A, Champions League");
    expect(named(["xx-9/2026-27/matches.json"], names)).toBe("xx-9");
    expect(named([], names)).toBe("");
  });
});
