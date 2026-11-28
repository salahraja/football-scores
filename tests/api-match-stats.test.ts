// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { reduceMatch, teamStats } from "../scripts/api/espn.mjs";
import { fetchMatches } from "../scripts/api/fetch-espn.mjs";
import { pages } from "../scripts/api/pages.mjs";

// The goal (Salah, 2026-11-28): features that match the big apps. FotMob, SofaScore and OneFootball show a game's team stats (possession,
// shots, corners, fouls, passes) and how the chances built up. ESPN's summary has the stats; the shots we keep give the xG race.
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-stats-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

const stat = (name: string, displayValue: string) => ({ name, displayValue });
const box = { teams: [
  { homeAway: "home", statistics: [stat("possessionPct", "58"), stat("totalShots", "12"), stat("shotsOnTarget", "8"), stat("wonCorners", "5"), stat("foulsCommitted", "11"),
    stat("offsides", "2"), stat("yellowCards", "0"), stat("redCards", "0"), stat("saves", "1"), stat("accuratePasses", "507"), stat("totalPasses", "578"), stat("totalTackles", "19"), stat("shotPct", "0.7")] },
  { homeAway: "away", statistics: [stat("possessionPct", "42"), stat("totalShots", "13"), stat("shotsOnTarget", "1"), stat("wonCorners", "2"), stat("foulsCommitted", "11"),
    stat("offsides", "1"), stat("yellowCards", "1"), stat("redCards", "0"), stat("saves", "4"), stat("accuratePasses", "348"), stat("totalPasses", "418"), stat("totalTackles", "16")] }] };

describe("team stats", () => {
  it("are read from ESPN's boxscore for each side, as numbers, and only the ones we show", () => {
    expect(teamStats({ boxscore: box })).toEqual({
      home: { possession: 58, shots: 12, onTarget: 8, corners: 5, fouls: 11, offsides: 2, yellow: 0, red: 0, saves: 1, passes: 578, accuratePasses: 507, tackles: 19 },
      away: { possession: 42, shots: 13, onTarget: 1, corners: 2, fouls: 11, offsides: 1, yellow: 1, red: 0, saves: 4, passes: 418, accuratePasses: 348, tackles: 16 } });
  });

  it("are null when ESPN gives none", () => {
    expect(teamStats({})).toBeNull();
    expect(teamStats({ boxscore: { teams: [] } })).toBeNull();
  });

  it("are kept in each reduced game", () => {
    const { summary, plays } = JSON.parse(readFileSync("tests/fixtures/espn/invented-match.json", "utf8"));
    expect(reduceMatch({ ...summary, boxscore: box }, plays).stats?.home.possession).toBe(58);
    expect(reduceMatch(summary, plays).stats).toBeNull();
  });
});

describe("the backfill", () => {
  it("fills stats into games saved before they were kept, at most `backfill` a run, with one summary request each", async () => {
    const out = tmp(), dir = join(out, "2026-27", "it-1");
    mkdirSync(dir, { recursive: true });
    for (const id of ["1", "2", "3"]) writeFileSync(join(dir, `${id}.json`), JSON.stringify({ espn: id, shots: [] }));
    writeFileSync(join(dir, "4.json"), JSON.stringify({ espn: "4", shots: [], stats: { home: { possession: 50 }, away: { possession: 50 } } }));
    const asked: string[] = [];
    const fetchFn = async (url: string) => { asked.push(url); return { ok: true, json: async () => (url.includes("scoreboard") ? { events: [] } : { boxscore: box }) } as Response; };
    const report = await fetchMatches({ out, season: "2026-27", ids: ["it-1"], days: 1, backfill: 2, fetchFn, wait: async () => {} });
    const summaries = asked.filter((u) => u.includes("/summary?event="));
    expect(summaries).toHaveLength(2);
    expect(report.backfilled).toHaveLength(2);
    const filled = ["1", "2", "3"].filter((id) => JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8")).stats);
    expect(filled).toHaveLength(2);
    expect(JSON.parse(readFileSync(join(dir, "4.json"), "utf8")).stats.home.possession).toBe(50);  // never asked again
  });

  it("marks a game ESPN has no stats for, so it is not asked again every run", async () => {
    const out = tmp(), dir = join(out, "2026-27", "it-1");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "9.json"), JSON.stringify({ espn: "9", shots: [] }));
    const fetchFn = async (url: string) => ({ ok: true, json: async () => (url.includes("scoreboard") ? { events: [] } : {}) }) as Response;
    await fetchMatches({ out, season: "2026-27", ids: ["it-1"], days: 1, backfill: 5, fetchFn, wait: async () => {} });
    expect(JSON.parse(readFileSync(join(dir, "9.json"), "utf8")).stats).toBeNull();
  });
});

describe("a game page", () => {
  const site = (withStats: boolean) => {
    const { summary, plays } = JSON.parse(readFileSync("tests/fixtures/espn/invented-match.json", "utf8"));
    const espn = tmp(), out = tmp();
    mkdirSync(join(espn, "2025-26", "it-1"), { recursive: true });
    writeFileSync(join(espn, "2025-26", "it-1", "9001.json"), JSON.stringify({ ...reduceMatch(withStats ? { ...summary, boxscore: box } : summary, plays), kickoff: "2025-08-24T18:45Z",
      home: { name: "Juventus", score: 2, formation: "4-3-3" }, away: { name: "Parma Calcio 1913", score: 0, formation: "3-5-2" } }));
    build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), espn, out, seasons: ["2025-26"], now: "2026-05-25T09:00:00Z" });
    pages({ api: join(out, "api/v1"), out });
    const game = JSON.parse(readFileSync(join(out, "api/v1/it-1/2025-26/games/2025-08-24-juventus-parma.json"), "utf8"));
    return { html: readFileSync(join(out, "leagues/it-1/2025-08-24-juventus-parma/index.html"), "utf8"), game };
  };

  it("keeps the stats in the published game file", () => {
    expect(site(true).game.stats.away.saves).toBe(4);
    expect(site(false).game.stats).toBeNull();
  });

  it("shows Match stats as two-sided bars, said in words, when ESPN had them", () => {
    const { html } = site(true);
    expect(html).toContain("<h2>Match stats</h2>");
    expect(html).toContain('<td class="h">58%</td><th scope="row">Possession</th><td class="a">42%</td>');
    expect(html).toContain('<td class="h">507 of 578</td><th scope="row">Passes completed</th><td class="a">348 of 418</td>');
    expect(html).toContain('<div class="bars"><span class="b-home" style="width: 58%"></span><span class="b-away" style="width: 42%"></span></div>');
    expect(site(false).html).not.toContain("<h2>Match stats</h2>");
  });

  it("draws the xG race: each side's expected goals added up minute by minute, with the goals marked", () => {
    const { html } = site(false);
    expect(html).toContain("<h2>How the chances came</h2>");
    const svg = html.slice(html.indexOf('<svg class="xgrace"'), html.indexOf("</svg>", html.indexOf('<svg class="xgrace"')));
    expect(svg).toMatch(/<title[^>]*>[^<]*expected goals[^<]*<\/title>/i);
    expect((svg.match(/<path class="race (home|away)"/g) ?? []).length).toBe(2);
    expect(svg).toMatch(/class="goalmark/);
  });
});
