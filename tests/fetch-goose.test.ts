// @vitest-environment node
// The Goose fetch (goose/fetch.goose) must write the same bytes as the Node fetch (scripts/fetch-data.mjs) for the same replies,
// and refuse the same bad ones. Runs only where the Goose compiler is installed, as the engine tests do.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { FetchError, seasonLabel, toResultsRaw, toStandingsRaw } from "../scripts/fetch-data.mjs";

const compiler = process.env.GOOSE ?? join(homedir(), ".local/share/goose-lang/build/goose");
const have = existsSync(compiler);
let bin = "";
beforeAll(() => {
  if (have) bin = execFileSync("sh", ["goose/fetch.sh"], { encoding: "utf8" }).trim();
}, 180_000);

const run = (mode: string, body: unknown) => spawnSync(bin, [mode], { input: JSON.stringify(body), encoding: "utf8", env: { PATH: "/usr/bin:/bin" } });
const node = (fn: (b: unknown) => unknown, body: unknown) => {
  try { return { out: JSON.stringify(fn(body), null, 1) + "\n", err: "" }; } catch (e) { return { out: "", err: (e as FetchError).message }; }
};

const team = (id: number, name: string, shortName?: string) => ({ id, name, ...(shortName !== undefined ? { shortName } : {}), crest: "x" });
const row = (t: object, p = 3, w = 2, d = 1, l = 0) => ({ position: 1, team: t, playedGames: p, won: w, draw: d, lost: l, points: 7 });
const total = (table: unknown) => ({ season: { startDate: "2026-08-23", endDate: "2027-05-30" }, standings: [{ type: "HOME", table: [] }, { type: "TOTAL", table }] });
const match = (id: number, status: string, h: unknown, a: unknown, extra: object = {}) =>
  ({ id, status, matchday: 4, homeTeam: team(10, "Alpha FC Milano", "Alpha"), awayTeam: team(11, "Beta Calcio"), score: { fullTime: { home: h, away: a } }, ...extra });

const standings: [string, unknown][] = [
  ["two clubs, a short name and a long one", total([row(team(10, "Alpha FC Milano", "Alpha")), row(team(11, "Beta Calcio"), 3, 1, 1, 1)])],
  ["accents, quotes and a backslash", total([row(team(12, "Atlético \"Madrid\" \\ Ñ", "")), row(team(13, "Genoa CFC", "Genoa"))])],
  ["an empty short name falls back to the name", total([row(team(14, "Hellas Verona", ""))])],
  ["no TOTAL table", { standings: [{ type: "HOME", table: [row(team(1, "A"))] }] }],
  ["an empty TOTAL table", total([])],
  ["a negative count", total([row(team(10, "A"), -1)])],
  ["a fractional count", total([row(team(10, "A"), 2.5)])],
  ["a team with no name", total([row({ id: 10 })])],
];
const results: [string, unknown][] = [
  ["finished matches only, in reply order", { matches: [match(1, "FINISHED", 2, 1), match(2, "SCHEDULED", null, null), match(3, "FINISHED", 0, 0)] }],
  ["no finished matches yet", { matches: [match(2, "SCHEDULED", null, null)] }],
  ["no matches list", { matches: {} }],
  ["a finished match with no score", { matches: [match(1, "FINISHED", null, 1)] }],
  ["a finished match with a string id", { matches: [{ ...match(1, "FINISHED", 1, 1), id: "1" }] }],
];

describe.skipIf(!have)("the Goose fetch converts like the Node fetch", () => {
  it.each(standings)("standings: %s", (_, body) => {
    const want = node(toStandingsRaw, body);
    const got = run("standings", body);
    expect(got.stdout).toBe(want.out);
    expect(got.stderr.trim()).toBe(want.err);
    expect(got.status).toBe(want.err ? 1 : 0);
  });
  it.each(results)("results: %s", (_, body) => {
    const want = node(toResultsRaw, body);
    const got = run("results", body);
    expect(got.stdout).toBe(want.out);
    expect(got.stderr.trim()).toBe(want.err);
  });
  it.each([
    ["2026-08-23", "2027-05-30"], ["2027-01-10", "2027-12-01"], ["", "2027-05-30"], ["26-08-01", "2027-05-30"], ["2099-08-01", "2100-05-01"],
  ])("season label for %s to %s", (startDate, endDate) => {
    const body = { season: { startDate, endDate } };
    expect(run("season", body).stdout).toBe((seasonLabel(body) ?? "") + "\n");
  });
  it("with no token it warns, writes nothing and still succeeds", () => {
    const dir = mkdtempSync(join(tmpdir(), "gfetch-"));
    const r = spawnSync(bin, [dir], { encoding: "utf8", env: { PATH: "/usr/bin:/bin" } });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("FOOTBALL_DATA_TOKEN is not set");
    expect(readdirSync(dir)).toEqual([]);
  });
  it("a bad token is a warning with the HTTP code, never the token, and writes nothing", () => {
    const dir = mkdtempSync(join(tmpdir(), "gfetch-"));
    const secret = "not-a-real-token-5150";
    const r = spawnSync(bin, [dir], { encoding: "utf8", env: { PATH: "/usr/bin:/bin", FOOTBALL_DATA_TOKEN: secret }, timeout: 40_000 });
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/keeping the committed snapshot/);
    expect(r.stdout + r.stderr).not.toContain(secret);
    expect(readdirSync(dir)).toEqual([]);
  }, 45_000);
});
