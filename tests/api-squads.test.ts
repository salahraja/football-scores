// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv/dist/2020";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { fetchSquads, reduceSquad } from "../scripts/api/fetch-squads.mjs";
import { teamId } from "../scripts/api/teams.mjs";

// Players for the onboarding (Salah, 2026-11-25: "create an onboarding process ... teams, national teams, leagues, players"): each
// league club's squad from ESPN's football feeds (the same decision as the game detail, docs/api.md), kept for a week, into
// api/v1/<league>/<season>/players.json with our team ids. The fixtures are invented, in the feeds' shape.
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-squads-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const athlete = (id: string, name: string, jersey: string, pos: string) => ({ id, displayName: name, jersey, position: { abbreviation: pos }, headshot: { href: "x" }, statistics: {} });
const roster = (teamId: string, name: string, players: unknown[]) => ({ team: { id: teamId, displayName: name }, athletes: players, coach: [{ firstName: "A" }] });
const teams = { sports: [{ leagues: [{ teams: [{ team: { id: "111", displayName: "Juventus" } }, { team: { id: "103", displayName: "Inter Milan" } }] }] }] };
const feed = (asked: string[]) => async (url: string) => {
  asked.push(url);
  if (url.endsWith("/teams")) return ok(teams) as never;
  if (url.includes("/teams/111/roster")) return ok(roster("111", "Juventus", [athlete("1", "Ana Ito", "10", "M"), athlete("2", "Bo Lund", "1", "G")])) as never;
  if (url.includes("/teams/103/roster")) return ok(roster("103", "Inter Milan", [athlete("3", "Cy Moor", "9", "F")])) as never;
  return { ok: false, status: 404, json: async () => ({}) } as never;
};
const now = new Date("2026-11-25T12:00:00Z");

describe("a squad", () => {
  it("keeps each player's id, name, number and position, and nothing else of the feed", () => {
    expect(reduceSquad(roster("111", "Juventus", [athlete("1", "Ana Ito", "10", "M"), athlete("9", "No Number", "", "D")]))).toEqual({
      team: { id: "111", name: "Juventus" },
      players: [{ id: "1", name: "Ana Ito", number: 10, position: "M" }, { id: "9", name: "No Number", number: null, position: "D" }],
    });
  });
});

describe("downloading the squads", () => {
  it("saves every club's squad once a week, asking only the build's two ESPN hosts", async () => {
    const out = tmp(), asked: string[] = [];
    const report = await fetchSquads({ out, season: "2026-27", now, ids: ["it-1"], fetchFn: feed(asked), wait: async () => {} });
    expect(report.saved).toEqual(["it-1/111", "it-1/103"]);
    expect(JSON.parse(readFileSync(join(out, "2026-27", "it-1", "squads", "111.json"), "utf8")).players).toHaveLength(2);
    expect(asked.every((u) => u.startsWith("https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/"))).toBe(true);
    // a day later nothing is asked again; eight days later the squads are fetched afresh
    const again: string[] = [];
    await fetchSquads({ out, season: "2026-27", now: new Date("2026-11-26T12:00:00Z"), ids: ["it-1"], fetchFn: feed(again), wait: async () => {} });
    expect(again).toEqual([]);
    for (const f of ["111", "103", "_teams"]) utimesSync(join(out, "2026-27", "it-1", "squads", `${f}.json`), new Date("2026-11-17T00:00:00Z"), new Date("2026-11-17T00:00:00Z"));
    const later: string[] = [];
    await fetchSquads({ out, season: "2026-27", now, ids: ["it-1"], fetchFn: feed(later), wait: async () => {} });
    expect(later.filter((u) => u.includes("/roster"))).toHaveLength(2);
  });

  it("never throws: a failed squad is reported and the saved one kept", async () => {
    const out = tmp();
    const report = await fetchSquads({ out, season: "2026-27", now, ids: ["it-1"], wait: async () => {},
      fetchFn: async (url: string) => (url.includes("/teams/103/") ? { ok: false, status: 503, json: async () => ({}) } : await feed([])(url)) as never });
    expect(report.saved).toEqual(["it-1/111"]);
    expect(report.kept).toEqual(["it-1/103 (HTTP 503)"]);
  });
});

describe("players.json", () => {
  const schema = JSON.parse(readFileSync("data/api/schema.json", "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
  ajv.addSchema(schema);
  const check = (body: unknown) => ajv.validate(`${schema.$id}#/$defs/players`, body) ? [] : ajv.errors!.map((e) => `${e.instancePath} ${e.message}`);

  it("lists every player of the season's clubs with our team id, and leaves out a club we cannot name", async () => {
    const espn = tmp(), out = tmp();
    // the 2025-26 fixtures' Serie A has Juventus and Inter; a third squad names a club that is not in the league
    for (const [id, body] of [["111", roster("111", "Juventus", [athlete("1", "Ana Ito", "10", "M")])], ["103", roster("103", "Inter Milan", [athlete("3", "Cy Moor", "9", "F")])],
      ["999", roster("999", "Nowhere FC", [athlete("7", "Lost Player", "7", "D")])]] as const) {
      mkdirSync(join(espn, "2025-26", "it-1", "squads"), { recursive: true });
      writeFileSync(join(espn, "2025-26", "it-1", "squads", `${id}.json`), JSON.stringify(reduceSquad(body)));
    }
    build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), espn, out, seasons: ["2025-26"], now: "2026-05-25T09:00:00Z" });
    const file = JSON.parse(readFileSync(join(out, "api/v1/it-1/2025-26/players.json"), "utf8"));
    expect(check(file)).toEqual([]);
    expect(file.players).toEqual([
      { id: "3", name: "Cy Moor", team: "inter", number: 9, position: "F" },
      { id: "1", name: "Ana Ito", team: "juventus", number: 10, position: "M" },
    ]);
    expect(existsSync(join(out, "api/v1/en-1/2025-26/players.json"))).toBe(false);  // no squads saved for it
  });
});

describe("ESPN's club names", () => {
  it("every club of the eight leagues' squads of 25 November 2026 maps to one of our ids", () => {
    // the six ESPN writes differently from our other sources; the rest already map
    expect(["Internazionale", "FC Cologne", "Hamburg SV", "Ajax Amsterdam", "Estoril", "Estrela"].map(teamId))
      .toEqual(["inter", "koln", "hamburger", "ajax", "estoril-praia", "estrela-da-amadora"]);
  });
});
