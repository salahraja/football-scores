// @vitest-environment node
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run, toResultsRaw, toStandingsRaw } from "../scripts/fetch-data.mjs";
import { resultsData, standingsData } from "../src/data/build";

// Small invented replies in the football-data.org v4 shape (extra fields are the kind the real API adds).
const standingsBody = {
  competition: { code: "SA" },
  standings: [
    { type: "HOME", table: [] },
    {
      type: "TOTAL",
      table: [
        { position: 1, team: { id: 10, name: "Alpha FC Milano", shortName: "Alpha", crest: "x" }, playedGames: 3, won: 2, draw: 1, lost: 0, points: 7, goalsFor: 5 },
        { position: 2, team: { id: 11, name: "Beta Calcio" }, playedGames: 3, won: 1, draw: 1, lost: 1, points: 4 },
      ],
    },
  ],
};
const matchesBody = {
  matches: [
    { id: 1, status: "FINISHED", matchday: 1, homeTeam: { id: 10, name: "Alpha FC Milano", shortName: "Alpha" }, awayTeam: { id: 11, name: "Beta Calcio" }, score: { fullTime: { home: 2, away: 1 } } },
    { id: 2, status: "FINISHED", matchday: 2, homeTeam: { id: 11, name: "Beta Calcio" }, awayTeam: { id: 10, name: "Alpha FC Milano", shortName: "Alpha" }, score: { fullTime: { home: 0, away: 0 } } },
    { id: 3, status: "SCHEDULED", matchday: 3, homeTeam: { id: 10, name: "Alpha FC Milano" }, awayTeam: { id: 11, name: "Beta Calcio" }, score: { fullTime: { home: null, away: null } } },
  ],
};

const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const SECRET = "tok-secret-1234";

describe("shape converters", () => {
  it("standings: TOTAL table to raw rows, short names, position and points left for the engine", () => {
    expect(toStandingsRaw(standingsBody)).toEqual([
      { id: 10, position: 0, team: { id: 10, name: "Alpha" }, matches: 3, wins: 2, draws: 1, losses: 0, points: 0 },
      { id: 11, position: 0, team: { id: 11, name: "Beta Calcio" }, matches: 3, wins: 1, draws: 1, losses: 1, points: 0 },
    ]);
  });
  it("matches: only finished ones, in the event shape", () => {
    const r = toResultsRaw(matchesBody);
    expect(r.map((e: { id: number }) => e.id)).toEqual([1, 2]);
    expect(r[0]).toEqual({
      id: 1, homeScore: { current: 2 }, homeTeam: { id: 10, name: "Alpha" }, awayScore: { current: 1 },
      awayTeam: { id: 11, name: "Beta Calcio" }, status: { type: "finished" }, roundInfo: { round: 1 },
    });
  });
  it("the converted rows go through the TS engine", () => {
    expect(standingsData(toStandingsRaw(standingsBody))[0]).toMatchObject({ position: 1, points: 7 });
    expect(resultsData(toResultsRaw(matchesBody))[0].round).toBe(2);
  });
  it("rejects a reply of the wrong shape", () => {
    expect(() => toStandingsRaw({ standings: [] })).toThrow(/TOTAL/);
    expect(() => toStandingsRaw({ standings: [{ type: "TOTAL", table: [{ team: { id: 1, name: "x" } }] }] })).toThrow(/shape/);
    expect(() => toResultsRaw({})).toThrow(/matches list/);
    expect(() => toResultsRaw({ matches: [] })).toThrow(/no finished/);
  });
});

describe("run", () => {
  let dir: string;
  let warn: ReturnType<typeof vi.spyOn>;
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fs-fetch-"));
    writeFileSync(join(dir, "standings.json"), "SNAPSHOT");
    writeFileSync(join(dir, "results.json"), "SNAPSHOT");
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    log = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());
  const snapshotKept = () => ["standings.json", "results.json"].every((f) => readFileSync(join(dir, f), "utf8") === "SNAPSHOT");
  const printed = () => [...warn.mock.calls, ...log.mock.calls].flat().join("\n");

  it("writes both files with the token in X-Auth-Token and two calls only", async () => {
    const fetchFn = vi.fn(async (url: string, _init?: { headers: Record<string, string> }) => reply(200, url.includes("/standings") ? standingsBody : matchesBody));
    expect(await run({ token: SECRET, dir, fetchFn })).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][1]?.headers).toEqual({ "X-Auth-Token": SECRET });
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      "https://api.football-data.org/v4/competitions/SA/standings",
      "https://api.football-data.org/v4/competitions/SA/matches",
    ]);
    expect(JSON.parse(readFileSync(join(dir, "standings.json"), "utf8"))).toHaveLength(2);
    expect(readdirSync(dir).sort()).toEqual(["results.json", "standings.json"]);
    expect(printed()).not.toContain(SECRET);
  });

  it("missing token: no call, snapshot kept, warning", async () => {
    const fetchFn = vi.fn();
    expect(await run({ token: undefined, dir, fetchFn })).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(snapshotKept()).toBe(true);
    expect(printed()).toMatch(/FOOTBALL_DATA_TOKEN is not set/);
  });

  it("HTTP error: snapshot kept, warning without the token", async () => {
    expect(await run({ token: SECRET, dir, fetchFn: async () => reply(403) })).toBe(false);
    expect(snapshotKept()).toBe(true);
    expect(printed()).toMatch(/HTTP 403/);
    expect(printed()).not.toContain(SECRET);
  });

  it("second call failing writes nothing (no half-updated pair)", async () => {
    const fetchFn = async (url: string) => (url.includes("/standings") ? reply(200, standingsBody) : reply(500));
    expect(await run({ token: SECRET, dir, fetchFn })).toBe(false);
    expect(snapshotKept()).toBe(true);
  });

  it("network error: snapshot kept", async () => {
    const fetchFn = async () => { throw new TypeError(`fetch failed for ${SECRET}`); };
    expect(await run({ token: SECRET, dir, fetchFn })).toBe(false);
    expect(snapshotKept()).toBe(true);
    expect(printed()).not.toContain(SECRET);
  });

  it("rate limit: waits Retry-After once, then succeeds", async () => {
    const sleep = vi.fn(async () => {});
    let n = 0;
    const fetchFn = async (url: string) => {
      if (n++ === 0) return reply(429, {}, { "retry-after": "30" });
      return reply(200, url.includes("/standings") ? standingsBody : matchesBody);
    };
    expect(await run({ token: SECRET, dir, fetchFn, sleep })).toBe(true);
    expect(sleep.mock.calls).toEqual([[30_000]]);
  });

  it("rate limit twice: gives up, snapshot kept", async () => {
    const sleep = vi.fn(async () => {});
    expect(await run({ token: SECRET, dir, fetchFn: async () => reply(429, {}, { "retry-after": "5" }), sleep })).toBe(false);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(snapshotKept()).toBe(true);
    expect(printed()).toMatch(/rate limited/);
  });

  it("rate limit with a long Retry-After: does not wait", async () => {
    const sleep = vi.fn(async () => {});
    expect(await run({ token: SECRET, dir, fetchFn: async () => reply(429, {}, { "retry-after": "3600" }), sleep })).toBe(false);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("unreadable body: snapshot kept", async () => {
    const fetchFn = async () => new Response("<html>", { status: 200 });
    expect(await run({ token: SECRET, dir, fetchFn })).toBe(false);
    expect(snapshotKept()).toBe(true);
  });
});
