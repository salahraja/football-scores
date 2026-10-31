// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv/dist/2020";
import { afterEach, describe, expect, it } from "vitest";
import { leagues } from "../scripts/api/config.mjs";
import { build } from "../scripts/api/build.mjs";
import { fetchPages } from "../scripts/api/fetch-wikipedia.mjs";
import { parseSeason } from "../scripts/api/openfootball.mjs";
import { teamId } from "../scripts/api/teams.mjs";
import type { Match } from "../scripts/api/types.d.mts";
import { applyResults, parseResults } from "../scripts/api/wikipedia.mjs";

// Wikipedia's season pages have every played league game in a results grid that volunteers fill in within hours (the 2026-27 pages were
// edited a day before this was written; openfootball had stopped six weeks earlier). We read the grid, fill in games openfootball has
// not scored yet, and never overwrite a score openfootball has: where the two differ, the build says so in meta.json.
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-wiki-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const fixture = (code: string) => JSON.parse(readFileSync(`tests/fixtures/wikipedia/2025-26/${code}.json`, "utf8"));

describe("reading Wikipedia's results grid", () => {
  for (const league of leagues()) {
    it(`${league.name}: every 2025-26 score equals the official results`, () => {
      const ours = parseResults(fixture(league.openfootball).wikitext)
        .map((r: { home: string; away: string; ft: number[] }) => `${teamId(r.home)}|${teamId(r.away)}|${r.ft}`).sort();
      const official = JSON.parse(readFileSync(`tests/fixtures/official/2025-26/${league.openfootball}.results.json`, "utf8")).matches
        .map((g: { home: string; away: string; ft: number[] }) => `${teamId(g.home)}|${teamId(g.away)}|${g.ft}`).sort();
      expect(ours).toEqual(official);
    });
  }

  it("reads the ways a score is written and skips what is not a score", () => {
    const text = `{{#invoke:Sports table|main
|name_AAA=[[Alpha FC|Alpha]]
|name_BBB=[[Beta Calcio]]
|name_KÖL=[[1. FC Köln|Köln]]
|match_AAA_BBB= 2–1
|match_BBB_AAA=0-3
|match_AAA_KÖL=[[Alpha FC 4–1 1. FC Köln|4–1]]
|match_KÖL_AAA=1–1<ref>{{cite web|title=x}}</ref>
|match_BBB_KÖL=
|match_KÖL_BBB={{abbr|P–P|Postponed}}
}}`;
    expect(parseResults(text)).toEqual([
      { home: "Alpha FC", away: "Beta Calcio", ft: [2, 1] },
      { home: "Beta Calcio", away: "Alpha FC", ft: [0, 3] },
      { home: "Alpha FC", away: "1. FC Köln", ft: [4, 1] },
      { home: "1. FC Köln", away: "Alpha FC", ft: [1, 1] },
    ]);
  });
});

describe("filling in openfootball's season", () => {
  const game = (home: string, away: string, ft: [number, number] | null, stage: Match["stage"] = "league"): Match => ({ id: `x:${home}-${away}`,
    round: "Matchday 1", stage, date: "2026-10-31", time: null, home, away, status: ft ? "finished" : "scheduled", score: ft ? { ft, ht: null } : null,
    source: "openfootball" });
  const teams = { inter: "Inter", milan: "Milan", napoli: "Napoli" };

  it("scores the games openfootball has not, keeps the ones it has, and reports where the two differ", () => {
    const matches = [game("milan", "inter", null), game("inter", "napoli", [2, 0]), game("napoli", "milan", [1, 1]), game("inter", "milan", null, "playoffs")];
    const results = [{ home: "AC Milan", away: "Inter Milan", ft: [1, 2] }, { home: "Inter Milan", away: "SSC Napoli", ft: [2, 0] },
      { home: "SSC Napoli", away: "AC Milan", ft: [0, 1] }, { home: "Inter Milan", away: "AC Milan", ft: [3, 0] }];
    const got = applyResults(matches, results, teams, "https://en.wikipedia.org/?oldid=1");
    expect(got.matches[0]).toMatchObject({ status: "finished", score: { ft: [1, 2], ht: null }, source: "wikipedia", sourceUrl: "https://en.wikipedia.org/?oldid=1" });
    expect(got.matches[1]).toEqual(matches[1]);
    expect(got.matches[2]).toEqual(matches[2]);
    expect(got.matches[3]).toEqual(matches[3]);  // a play-off game is never filled from the league grid
    expect(got.filled).toBe(1);
    expect(got.disagreements).toEqual([{ match: "x:napoli-milan", openfootball: [1, 1], wikipedia: [0, 1] }]);
  });

  it("never fills a game dated on the build day or later: Wikipedia is edited while games are on, so a score there may not be final", () => {
    const today = { ...game("milan", "inter", null), date: "2026-10-31" };
    const tomorrow = { ...game("inter", "napoli", null), date: "2026-11-01" };
    const got = applyResults([today, tomorrow], [{ home: "AC Milan", away: "Inter Milan", ft: [1, 0] }, { home: "Inter Milan", away: "SSC Napoli", ft: [2, 0] }],
      teams, "u", "2026-10-31");
    expect(got.matches).toEqual([today, tomorrow]);
    expect(got.filled).toBe(0);
  });

  it("refuses a team it cannot name, so a new club gets an alias instead of a silent gap", () => {
    expect(() => applyResults([game("milan", "inter", null)], [{ home: "AC Milan", away: "Pisa SC", ft: [1, 0] }], teams, "u"))
      .toThrow(/Pisa SC/);
  });
});

describe("downloading the pages", () => {
  const page = (title: string, revid: number, text: string) => ({ ok: true, status: 200, json: async () => ({ query: { pages: [
    { title, revisions: [{ revid, timestamp: "2026-10-30T09:44:49Z", slots: { main: { content: text } } }] }] } }) });
  const grid = "{{#invoke:Sports table|main\n|name_AAA=[[A]]\n|name_BBB=[[B]]\n|match_AAA_BBB=1–0\n}}";

  it("saves the results blocks with their revision, and follows a page that keeps its grid in a template", async () => {
    const out = tmp();
    const asked: string[] = [];
    const fetchFn = async (url: string) => {
      asked.push(decodeURIComponent(url));
      if (url.includes("Template")) return page("Template:2026–27 La Liga table", 22, grid) as never;
      if (url.includes("La_Liga") || url.includes("La%20Liga")) return page("2026–27 La Liga", 11, "intro\n{{2026–27 La Liga table|show_matches=only}}\n") as never;
      return page("2026–27 Serie A", 33, `text ${grid} more`) as never;
    };
    const report = await fetchPages({ out, seasons: ["2026-27"], ids: ["it-1", "es-1"], fetchFn });
    expect(report.saved).toEqual(["2026-27/it-1", "2026-27/es-1"]);
    const es = JSON.parse(readFileSync(join(out, "2026-27", "es-1.json"), "utf8"));
    expect(es).toMatchObject({ title: "Template:2026–27 La Liga table", revid: 22, wikitext: grid });
    expect(asked.every((u) => u.startsWith("https://en.wikipedia.org/w/api.php?"))).toBe(true);
  });

  it("keeps the saved page when a download fails or has no grid", async () => {
    const out = tmp();
    mkdirSync(join(out, "2026-27"), { recursive: true });
    writeFileSync(join(out, "2026-27", "it-1.json"), JSON.stringify({ kept: true }));
    const report = await fetchPages({ out, seasons: ["2026-27"], ids: ["it-1", "en-1"], fetchFn: async (url: string) =>
      (url.includes("Serie") ? { ok: false, status: 503 } : page("2026–27 Premier League", 5, "no grid here")) as never });
    expect(JSON.parse(readFileSync(join(out, "2026-27", "it-1.json"), "utf8"))).toEqual({ kept: true });
    expect(report.kept).toEqual(["2026-27/it-1 (HTTP 503)", "2026-27/en-1 (no results grid)"]);
  });
});

describe("the build with Wikipedia", () => {
  it("fills a game openfootball has not scored, says so in meta, and still matches the contract", () => {
    // openfootball's 2025-26 Serie A with its last game unscored, and Wikipedia's grid for the same season
    const input = tmp(), wiki = tmp(), out = tmp();
    const season = JSON.parse(readFileSync("tests/fixtures/openfootball/2025-26/it.1.json", "utf8"));
    const last = season.matches.at(-1);
    delete last.score;
    mkdirSync(join(input, "2025-26"), { recursive: true });
    writeFileSync(join(input, "2025-26", "it.1.json"), JSON.stringify(season));
    mkdirSync(join(wiki, "2025-26"), { recursive: true });
    writeFileSync(join(wiki, "2025-26", "it-1.json"), JSON.stringify(fixture("it.1")));
    build({ input, wikipedia: wiki, out, seasons: ["2025-26"], now: "2026-10-31T17:00:00Z" });

    const matches = JSON.parse(readFileSync(join(out, "api/v1/it-1/2025-26/matches.json"), "utf8")).matches;
    const filled = matches.find((m: { home: string; away: string }) => m.home === teamId(last.team1) && m.away === teamId(last.team2));
    expect(filled).toMatchObject({ status: "finished", source: "wikipedia" });
    const meta = JSON.parse(readFileSync(join(out, "api/v1/meta.json"), "utf8"));
    expect(meta.leagues["it-1"]["2025-26"].wikipedia).toEqual({ revision: fixture("it.1").revid, filled: 1, disagreements: [] });
    expect(meta.sources.map((s: { name: string }) => s.name)).toContain("Wikipedia");
    expect(JSON.parse(readFileSync(join(out, "api/v1/it-1/2025-26/table.json"), "utf8")).table[0]).toMatchObject({ team: "inter", points: 87 });

    const schema = JSON.parse(readFileSync("data/api/schema.json", "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
    ajv.addSchema(schema);
    for (const [def, path] of [["matches", "api/v1/it-1/2025-26/matches.json"], ["meta", "api/v1/meta.json"]]) {
      expect(ajv.validate(`${schema.$id}#/$defs/${def}`, JSON.parse(readFileSync(join(out, path), "utf8"))), JSON.stringify(ajv.errors)).toBe(true);
    }
  });

  it("is the same as before when there is no Wikipedia page", () => {
    const out = tmp();
    build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), out, seasons: ["2025-26"], now: "2026-10-31T17:00:00Z" });
    const meta = JSON.parse(readFileSync(join(out, "api/v1/meta.json"), "utf8"));
    expect(meta.leagues["it-1"]["2025-26"].wikipedia).toBeUndefined();
    expect(parseSeason).toBeTypeOf("function");
  });
});
