// @vitest-environment node
import { describe, expect, it } from "vitest";
import { minutesPlayed, seasonByPlayer } from "../scripts/api/players.mjs";

// The goal (Salah, 2026-11-28): FotMob and SofaScore give every player a season page: games, minutes, goals, assists, shots, xG, a heat
// map. Ours come from the game files we already publish (ESPN's detail), so they cover the games ESPN has, and say how many.
const P = (id: string, side: "home" | "away", starter: boolean, name = id) => ({ id, name, side, number: 9, position: "F", starter });
const zones = (n: number) => Array.from({ length: 30 }, (_, i) => (i === 25 ? n : 0));
const g1 = { match: "it-1:2026-08-24:juventus-parma", players: [P("vlahovic", "home", true), P("yildiz", "home", true), P("milik", "home", false), P("bonny", "away", true)],
  events: [{ minute: "23'", kind: "goal", side: "home", player: "vlahovic", other: "yildiz" }, { minute: "61'", kind: "sub", side: "home", player: "milik", other: "vlahovic" },
    { minute: "88'", kind: "penalty", side: "home", player: "milik", other: null }],
  shots: [{ side: "home", player: "vlahovic", minute: "23'", xg: 0.4, outcome: "goal" }, { side: "home", player: "vlahovic", minute: "40'", xg: 0.1, outcome: "off" },
    { side: "home", player: "milik", minute: "88'", xg: 0.76, outcome: "goal" }, { side: "away", player: "bonny", minute: "50'", xg: null, outcome: "saved" }],
  touches: { vlahovic: zones(20), yildiz: zones(30), milik: zones(4), bonny: zones(10) } };
const g2 = { match: "it-1:2026-08-31:inter-juventus", players: [P("vlahovic", "away", true), P("yildiz", "away", false)],
  events: [{ minute: "45'+2'", kind: "red", side: "away", player: "vlahovic", other: null }, { minute: "70'", kind: "sub", side: "away", player: "yildiz", other: "nobody" }],
  shots: [{ side: "away", player: "vlahovic", minute: "10'", xg: 0.2, outcome: "saved" }], touches: { vlahovic: zones(5), yildiz: zones(6) } };
const matches = [{ id: g1.match, date: "2026-08-24", home: "juventus", away: "parma", score: { ft: [2, 0] } }, { id: g2.match, date: "2026-08-31", home: "inter", away: "juventus", score: { ft: [1, 0] } }];
const teams = { juventus: "Juventus", parma: "Parma", inter: "Inter" };
const files = new Map<string, unknown>([["2026-08-24-juventus-parma", g1], ["2026-08-31-inter-juventus", g2]]);

describe("minutes", () => {
  it("are 90 for a full game, to the minute subbed off, from the minute subbed on, and to a red card", () => {
    expect(minutesPlayed(g1, "yildiz")).toBe(90);
    expect(minutesPlayed(g1, "vlahovic")).toBe(61);
    expect(minutesPlayed(g1, "milik")).toBe(29);
    expect(minutesPlayed(g2, "vlahovic")).toBe(47);
    expect(minutesPlayed(g2, "yildiz")).toBe(20);
  });

  it("are 0 for a substitute who never came on", () => {
    expect(minutesPlayed({ ...g1, events: [] }, "milik")).toBe(0);
  });
});

describe("a player's season", () => {
  const season = seasonByPlayer(files, matches, teams);
  it("adds up games, starts, minutes, goals (penalties in, own goals out), assists, shots, on target, xG and touches", () => {
    expect(season.vlahovic).toMatchObject({ name: "vlahovic", team: "juventus", apps: 2, starts: 2, minutes: 108, goals: 1, assists: 0, shots: 3, onTarget: 2, touches: 25 });
    expect(season.vlahovic.xg).toBeCloseTo(0.7, 6);
    expect(season.yildiz).toMatchObject({ apps: 2, starts: 1, minutes: 110, goals: 0, assists: 1 });
    expect(season.milik).toMatchObject({ apps: 1, starts: 0, minutes: 29, goals: 1, penalties: 1 });
  });

  it("keeps a season heat map: the touch zones of every game added up", () => {
    expect(season.vlahovic.zones[25]).toBe(25);
    expect(season.vlahovic.zones).toHaveLength(30);
  });

  it("lists each game newest first, with the score line and the player's own numbers", () => {
    expect(season.vlahovic.games.map((g: { game: string }) => g.game)).toEqual(["2026-08-31-inter-juventus", "2026-08-24-juventus-parma"]);
    expect(season.vlahovic.games[1]).toMatchObject({ title: "Juventus 2–0 Parma", minutes: 61, goals: 1, assists: 0, shots: 2 });
  });

  it("leaves out xG it does not have rather than guessing, and counts the shots without one", () => {
    expect(season.bonny).toMatchObject({ shots: 1, xg: 0, noXg: 1 });
  });

  it("leaves out a player on the bench who never came on", () => {
    const quiet = seasonByPlayer(new Map([["2026-08-24-juventus-parma", { ...g1, events: [] }]]), matches, teams);
    expect(quiet.milik).toBeUndefined();
  });
});

describe("on the site", async () => {
  const { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const Ajv = (await import("ajv/dist/2020")).default;
  const { build } = await import("../scripts/api/build.mjs");
  const { reduceMatch } = await import("../scripts/api/espn.mjs");
  const { pages } = await import("../scripts/api/pages.mjs");
  const made: string[] = [];
  const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-players-")); made.push(d); return d; };
  const { afterAll } = await import("vitest");
  afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
  const { summary, plays } = JSON.parse(readFileSync("tests/fixtures/espn/invented-match.json", "utf8"));
  const espn = tmp(), out = tmp();
  mkdirSync(join(espn, "2025-26", "it-1"), { recursive: true });
  writeFileSync(join(espn, "2025-26", "it-1", "9001.json"), JSON.stringify({ ...reduceMatch(summary, plays), kickoff: "2025-08-24T18:45Z",
    home: { name: "Juventus", score: 2, formation: "4-3-3" }, away: { name: "Parma Calcio 1913", score: 0, formation: "3-5-2" } }));
  build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), espn, out, seasons: ["2025-26"], now: "2026-05-25T09:00:00Z" });
  pages({ api: join(out, "api/v1"), out });
  const file = JSON.parse(readFileSync(join(out, "api/v1/it-1/2025-26/player-season.json"), "utf8"));
  const someone = Object.entries(file.players).find(([, p]: [string, any]) => p.touches > 0)! as [string, any];

  it("publishes player-season.json, matching its shape in the schema", () => {
    const schema = JSON.parse(readFileSync("data/api/schema.json", "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false }); ajv.addSchema(schema);
    expect(ajv.validate(`${schema.$id}#/$defs/playerSeason`, file), JSON.stringify(ajv.errors)).toBe(true);
    expect(file.games).toBe(1);
  });

  it("gives each player a page: their numbers, a season heat map and a game log linking each game", () => {
    const [id, p] = someone;
    const html = readFileSync(join(out, `leagues/it-1/players/${id}/index.html`), "utf8");
    expect(html).toContain(`<h1`);
    expect(html).toContain(p.name.replace(/'/g, "&#39;"));
    expect(html).toMatch(/<th scope="row">Minutes<\/th><td>\d+<\/td>/);
    expect(html).toMatch(/<svg class="pitch zones"/);
    expect(html).toContain('href="/leagues/it-1/2025-08-24-juventus-parma/"');
    expect(html).toMatch(/From the 1 game ESPN has detail for/);
  });

  it("links each player on a game page to their season page", () => {
    const [id] = someone;
    expect(readFileSync(join(out, "leagues/it-1/2025-08-24-juventus-parma/index.html"), "utf8")).toContain(`href="/leagues/it-1/players/${id}/"`);
  });

  it("puts assist and expected-goal leaders on the league page, saying how many games they come from", () => {
    const html = readFileSync(join(out, "leagues/it-1/index.html"), "utf8");
    expect(html).toContain("<h2>Expected goals</h2>");
    expect(html).toMatch(/<h2>Assists<\/h2>|No assists yet/);
    expect(html).toMatch(/From the 1 game ESPN has detail for/);
    expect(readdirSync(join(out, "leagues/it-1/players")).length).toBe(Object.keys(file.players).length);
  });
});
