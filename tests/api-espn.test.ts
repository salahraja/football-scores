// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv/dist/2020";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { ZONES, reduceMatch, zoneOf } from "../scripts/api/espn.mjs";
import { fetchMatches } from "../scripts/api/fetch-espn.mjs";

// ESPN's football feeds (Salah's decision, 25 November 2026: use them while golboard has no customers) give every on-ball event of a
// match with a position. We keep only our own small summary of a match: who played, the timeline, the shots, and each player's touches
// counted in 30 zones. Positions are percent of the pitch, each team attacking toward x = 100, y = 0 its right touchline.
// The fixture is an invented match in the feed's shape; no real feed data is kept in the repo.
const { summary, plays } = JSON.parse(readFileSync("tests/fixtures/espn/invented-match.json", "utf8"));

describe("reducing one match", () => {
  const m = reduceMatch(summary, plays);

  it("keeps the teams, the score and the formations", () => {
    expect(m.espn).toBe("9001");
    expect(m.kickoff).toBe("2026-11-22T14:00Z");
    expect(m.home).toEqual({ name: "Alpha FC", score: 2, formation: "4-3-3" });
    expect(m.away).toEqual({ name: "Beta United", score: 1, formation: "3-5-2" });
  });

  it("lists the players with their side, number and position", () => {
    expect(m.players).toContainEqual({ id: "11", name: "Ana Ito", side: "home", number: 10, position: "AM", starter: true });
    expect(m.players).toContainEqual({ id: "13", name: "Cy Moor", side: "home", number: 14, position: "CM", starter: false });
    expect(m.players).toHaveLength(5);
  });

  it("keeps goals, cards and substitutions in order; an own goal counts for the other side", () => {
    expect(m.events).toEqual([
      { minute: "53'", kind: "goal", side: "home", player: "12", other: "11" },
      { minute: "55'", kind: "penalty", side: "away", player: "21", other: null },
      { minute: "60'", kind: "yellow", side: "away", player: "22", other: null },
      { minute: "70'", kind: "sub", side: "home", player: "13", other: "11" },
      { minute: "84'", kind: "own-goal", side: "home", player: "22", other: null },
      { minute: "90'+2'", kind: "red", side: "away", player: "22", other: null },
    ]);
    // the goals add up to the score
    const goals = (side: string) => m.events.filter((e: { kind: string; side: string }) => ["goal", "penalty", "own-goal"].includes(e.kind) && e.side === side).length;
    expect([goals("home"), goals("away")]).toEqual([m.home.score, m.away.score]);
  });

  it("keeps every shot with where it was taken from, its outcome and xG; an own goal is not a shot", () => {
    expect(m.shots).toEqual([
      { side: "away", player: "21", minute: "6'", x: 85, y: 40, xg: 0.05, outcome: "blocked", body: "Right Foot", penalty: false },
      { side: "home", player: "12", minute: "53'", x: 95.7, y: 49, xg: 0.307, outcome: "goal", body: "Header", penalty: false },
      { side: "away", player: "21", minute: "56'", x: 88.5, y: 50, xg: 0.79, outcome: "goal", body: "Left Foot", penalty: true },
      { side: "home", player: "11", minute: "67'", x: 80, y: 70, xg: 0.02, outcome: "off", body: null, penalty: false },
      { side: "home", player: "12", minute: "69'", x: 90, y: 45, xg: null, outcome: "post", body: null, penalty: false },
    ]);
  });

  it("counts each player's on-ball touches in 30 zones; fouls, substitutions and deleted plays are not touches", () => {
    expect(m.positions).toBe(true);
    const total = (id: string) => m.touches[id].reduce((a: number, b: number) => a + b, 0);
    expect(total("11")).toBe(4);
    expect(total("12")).toBe(2);
    expect(total("21")).toBe(3);
    expect(total("22")).toBe(3);  // a pass from outside the pitch is put on its edge; the foul and the deleted pass are left out
    expect(m.touches["22"][2]).toBe(2);  // the goal kick (a touch, not a shot) and the own goal, both in the own box
    expect(m.touches["13"]).toBeUndefined();
    expect(m.touches["11"][0]).toBe(1);   // (10, 5): own box, right touchline
    expect(m.touches["11"][29]).toBe(1);  // (99, 99): opponent's box, left touchline
    expect(m.touches["11"][17]).toBe(1);  // (50, 50): first column past halfway, middle row
  });

  it("drops the betting blocks the feed carries", () => {
    expect(JSON.stringify(m)).not.toMatch(/odds|pickcenter|provider|book/i);
  });
});

describe("the zones", () => {
  it("are the pitch's own lines: the boxes, the thirds of each half and the centre circle's width", () => {
    expect(ZONES.x.length).toBe(7);
    expect(ZONES.y.length).toBe(6);
    expect(zoneOf(0, 0)).toBe(0);
    expect(zoneOf(100, 100)).toBe(29);
    expect(zoneOf(15.6, 50)).toBe(2);   // 16.4 m: inside the box
    expect(zoneOf(15.8, 50)).toBe(7);   // 16.6 m: just outside it
    expect(zoneOf(-3, 104)).toBe(4);    // out of play is put on the nearest edge
  });
});

describe("a match with no positions", () => {
  it("still has its lineups and timeline, and says it has no positions", () => {
    const bare = { ...plays[0], items: plays[0].items.map((p: Record<string, unknown>) => { const { fieldPositionX, fieldPositionY, ...rest } = p; return rest; }) };
    const m = reduceMatch(summary, [bare]);
    expect(m.positions).toBe(false);
    expect(m.events.length).toBe(6);
    expect(m.shots).toEqual([]);
  });
});

describe("downloading finished matches", () => {
  const dirs: string[] = [];
  afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  const event = (id: string, date: string, completed = true) => ({ id, date, status: { type: { completed } } });
  // one league, one day: an old finished game, a game that ended too recently (its plays are still being corrected), one not played
  const feed = (asked: string[]) => async (url: string) => {
    asked.push(url);
    if (url.includes("/scoreboard")) return ok({ events: [event("9001", "2026-11-22T14:00Z"), event("9002", "2026-11-22T20:00Z"), event("9003", "2026-11-23T14:00Z", false)] }) as never;
    if (url.includes("/summary")) return ok({ ...summary, header: { ...summary.header, id: url.match(/event=(\d+)/)![1] } }) as never;
    if (url.includes("/plays")) return ok(plays[Number(url.match(/page=(\d)/)![1]) - 1]) as never;
    return { ok: false, status: 404, json: async () => ({}) } as never;
  };
  const now = new Date("2026-11-22T23:00:00Z");

  it("saves our summary of each game that ended at least four hours ago, once", async () => {
    const out = mkdtempSync(join(tmpdir(), "golboard-espn-")); dirs.push(out);
    const asked: string[] = [];
    const report = await fetchMatches({ out, season: "2026-27", now, days: 1, ids: ["it-1"], fetchFn: feed(asked), wait: async () => {} });
    expect(report.saved).toEqual(["it-1/9001"]);
    const saved = JSON.parse(readFileSync(join(out, "2026-27", "it-1", "9001.json"), "utf8"));
    expect(saved.home.name).toBe("Alpha FC");
    expect(saved.shots).toHaveLength(5);
    expect(JSON.stringify(saved)).not.toMatch(/odds|pickcenter/);
    expect(asked.filter((u) => u.includes("/plays"))).toHaveLength(2);  // both pages
    expect(asked.every((u) => u.startsWith("https://site.api.espn.com/") || u.startsWith("https://sports.core.api.espn.com/"))).toBe(true);
    // a second run asks only for the day's games: the saved one is not fetched again
    const again: string[] = [];
    await fetchMatches({ out, season: "2026-27", now, days: 1, ids: ["it-1"], fetchFn: feed(again), wait: async () => {} });
    expect(again.filter((u) => !u.includes("/scoreboard"))).toEqual([]);
  });

  it("never throws: a failed download keeps going and says why", async () => {
    const out = mkdtempSync(join(tmpdir(), "golboard-espn-")); dirs.push(out);
    const report = await fetchMatches({ out, season: "2026-27", now, days: 1, ids: ["it-1", "en-1"], wait: async () => {},
      fetchFn: async (url: string) => (url.includes("eng.1") ? { ok: false, status: 503, json: async () => ({}) } : await feed([])(url)) as never });
    expect(report.saved).toEqual(["it-1/9001"]);
    expect(report.kept).toEqual(["en-1 2026-11-22 (HTTP 503)"]);
  });
});

describe("the game files", () => {
  const dirs: string[] = [];
  const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-espn-")); dirs.push(d); return d; };
  afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
  const schema = JSON.parse(readFileSync("data/api/schema.json", "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
  ajv.addSchema(schema);
  const check = (def: string, body: unknown) => ajv.validate(`${schema.$id}#/$defs/${def}`, body) ? [] : ajv.errors!.map((e) => `${e.instancePath} ${e.message}`);
  // the invented match, named and dated as Juventus 2-0 Parma on 24 August 2025 (a game in the 2025-26 fixtures)
  const saved = (changes: Record<string, unknown> = {}) => {
    const m = { ...reduceMatch(summary, plays), kickoff: "2025-08-24T18:45Z", home: { name: "Juventus", score: 2, formation: "4-3-3" },
      away: { name: "Parma Calcio 1913", score: 0, formation: "3-5-2" }, ...changes };
    const dir = tmp();
    mkdirSync(join(dir, "2025-26", "it-1"), { recursive: true });
    writeFileSync(join(dir, "2025-26", "it-1", "9001.json"), JSON.stringify(m));
    return dir;
  };
  const run = (espn: string) => {
    const out = tmp();
    build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), espn, out, seasons: ["2025-26"], now: "2026-05-25T09:00:00Z" });
    return (path: string) => (existsSync(join(out, path)) ? JSON.parse(readFileSync(join(out, path), "utf8")) : undefined);
  };

  it("pairs each saved game with ours by its two teams, and writes it beside the season with our ids", () => {
    const read = run(saved());
    const game = read("api/v1/it-1/2025-26/games/2025-08-24-juventus-parma.json");
    expect(check("game", game)).toEqual([]);
    expect(game.match).toBe("it-1:2025-08-24:juventus-parma");
    expect(game.home).toEqual({ team: "juventus", formation: "4-3-3" });
    expect(game.source).toEqual({ name: "ESPN", url: "https://www.espn.com/soccer/match/_/gameId/9001" });
    expect(game.shots).toHaveLength(5);
    expect(read("api/v1/meta.json").leagues["it-1"]["2025-26"].espn).toEqual({ games: 1, unknown: [], disagree: [], overruled: [] });
    expect(Object.keys(read("api/v1/meta.json").files)).toContain("api/v1/it-1/2025-26/games/2025-08-24-juventus-parma.json");
  });

  it("writes nothing for a game whose score is not ours, or whose team we cannot name, and says so", () => {
    let read = run(saved({ home: { name: "Juventus", score: 3, formation: null } }));
    expect(read("api/v1/it-1/2025-26/games/2025-08-24-juventus-parma.json")).toBeUndefined();
    expect(read("api/v1/meta.json").leagues["it-1"]["2025-26"].espn.disagree).toEqual(["9001"]);
    read = run(saved({ away: { name: "Parma Ducks", score: 0, formation: null } }));
    expect(read("api/v1/meta.json").leagues["it-1"]["2025-26"].espn.unknown).toEqual(["Parma Ducks"]);
    expect(read("api/v1/it-1/2025-26/table.json")).toBeDefined();  // and the build goes on
  });

  it("a season with no saved games has no game files and no espn entry", () => {
    const read = run(tmp());
    expect(read("api/v1/meta.json").leagues["it-1"]["2025-26"].espn).toBeUndefined();
  });
});

describe("ESPN as a second witness for Wikipedia's scores", () => {
  const dirs: string[] = [];
  const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-espn-")); dirs.push(d); return d; };
  afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
  // 23 November 2026: Wikipedia's Serie A grid said Juventus 0-10 Venezia for a 4-0 game, and openfootball had no score yet, so the
  // table counted a 10-0 away win. Here openfootball has not scored Juventus v Parma, Wikipedia's grid says 0-10, ESPN says 2-0.
  const setUp = (espnScore: [number, number] | null) => {
    const input = tmp(), wiki = tmp(), espn = tmp(), out = tmp();
    const season = JSON.parse(readFileSync("tests/fixtures/openfootball/2025-26/it.1.json", "utf8"));
    const game = season.matches.find((m: { team1: string; team2: string }) => m.team1 === "Juventus FC" && m.team2 === "Parma Calcio 1913");
    delete game.score;
    mkdirSync(join(input, "2025-26"), { recursive: true });
    writeFileSync(join(input, "2025-26", "it.1.json"), JSON.stringify(season));
    mkdirSync(join(wiki, "2025-26"), { recursive: true });
    writeFileSync(join(wiki, "2025-26", "it-1.json"), JSON.stringify({ title: "t", revid: 7, timestamp: "x",
      wikitext: "{{#invoke:Sports table|main\n|name_JUV=[[Juventus FC|Juventus]]\n|name_PAR=[[Parma Calcio 1913|Parma]]\n|match_JUV_PAR=0-10\n}}" }));
    if (espnScore) {
      mkdirSync(join(espn, "2025-26", "it-1"), { recursive: true });
      writeFileSync(join(espn, "2025-26", "it-1", "9001.json"), JSON.stringify({ ...reduceMatch(summary, plays), kickoff: "2025-08-24T18:45Z",
        home: { name: "Juventus", score: espnScore[0], formation: null }, away: { name: "Parma Calcio 1913", score: espnScore[1], formation: null } }));
    }
    build({ input, wikipedia: wiki, espn, out, seasons: ["2025-26"], now: "2026-05-25T09:00:00Z" });
    const read = (path: string) => JSON.parse(readFileSync(join(out, path), "utf8"));
    return { match: read("api/v1/it-1/2025-26/matches.json").matches.find((m: { id: string }) => m.id === "it-1:2025-08-24:juventus-parma"), meta: read("api/v1/meta.json") };
  };

  it("a Wikipedia score ESPN disagrees with is not used: the game waits for openfootball, and the build says so", () => {
    const { match, meta } = setUp([2, 0]);
    expect(match.status).toBe("scheduled");
    expect(match.score).toBeNull();
    expect(meta.leagues["it-1"]["2025-26"].espn.overruled).toEqual(["it-1:2025-08-24:juventus-parma"]);
  });

  it("a Wikipedia score ESPN agrees with, or one ESPN has no game for, is used as before", () => {
    expect(setUp([0, 10]).match.score.ft).toEqual([0, 10]);
    expect(setUp(null).match.score.ft).toEqual([0, 10]);
  });
});
