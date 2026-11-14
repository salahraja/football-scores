// @vitest-environment jsdom
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { tournaments } from "../scripts/api/config.mjs";
import { liveScript, pages } from "../scripts/api/pages.mjs";
import { teamId } from "../scripts/api/teams.mjs";

// Live scores on the cup and international pages, from the same SportScore feed the league pages use. SportScore's names were read from
// its fixtures for the last eight match days of each competition on 14 November 2026: these are every name that did not already match.
const FIX = "tests/fixtures/wikipedia/2026-27";
const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); vi.useRealTimers(); });
function site() {
  const out = mkdtempSync(join(tmpdir(), "golboard-cuplive-")), wiki = mkdtempSync(join(tmpdir(), "golboard-cuplive-wiki-"));
  dirs.push(out, wiki);
  mkdirSync(join(wiki, "2026-27"));
  for (const t of tournaments()) copyFileSync(`${FIX}/${t.id}.json`, join(wiki, "2026-27", `${t.id}.json`));
  build({ input: "tests/fixtures/openfootball", wikipedia: wiki, out, seasons: ["2025-26"], now: "2026-11-14T03:00:00Z" });
  pages({ api: join(out, "api/v1"), out });
  return out;
}
const browserTeamId = () => {
  const win = { document: { querySelectorAll: () => [] } } as never;
  return new Function("window", "document", `${liveScript()}; return window.golboardLive;`)(win, (win as { document: unknown }).document).teamId;
};

describe("letters that do not come apart into a plain letter and an accent", () => {
  it("are spelled out, so Bodø, Białystok, Lillestrøm and Nordsjælland keep their whole names", () => {
    expect(teamId("Bodø/Glimt")).toBe("bodo-glimt");
    expect(teamId("Jagiellonia Białystok")).toBe("jagiellonia-bialystok");
    expect(teamId("Lillestrøm")).toBe("lillestrom");
    expect(teamId("Nordsjælland")).toBe("nordsjaelland");
    expect(browserTeamId()("FK Bodo/Glimt")).toBe(teamId("Bodø/Glimt"));
  });
});

describe("SportScore's names for the cups' teams", () => {
  const spellings: Record<string, string[]> = {
    "champions-league": ["FK Bodo/Glimt", "Sabah Baku", "SK Slavia Praha", "LOSC Lille", "Club Brugge", "LASK Linz"],
    "europa-league": ["AC Sparta Praha", "Omonia Nicosia FC", "RC Celta", "Anderlecht", "NK Publikum Celje", "Dinamo Zagreb", "Olympiacos Piraeus",
      "Jagiellonia Bialystok", "Levski Sofia", "Lillestrom", "SCU Torreense", "Besiktas JK", "Union Saint-Gilloise"],
    "conference-league": ["Hajduk Split", "CSKA Sofia", "Egnatia", "FC Kairat Almaty", "Crvena Zvezda", "Aarhus AGF", "KuPs", "Sporting Braga",
      "FC Twente Enschede", "Sint-Truidense", "FC Iberia 1999 Tbilisi", "Nordsjaelland"],
    "nations-league": ["Ireland", "Turkiye", "Czechia"],
    afcon: ["Democratic Republic of the Congo", "Cabo Verde", "Republic of the Congo", "Cote d'Ivoire"],
  };
  it("each name is one of that competition's teams, in the build and in the browser", () => {
    const out = site();
    const live = browserTeamId();
    for (const [id, names] of Object.entries(spellings)) {
      const teams = JSON.parse(readFileSync(join(out, "api/v1", id, "2026-27", "teams.json"), "utf8")).teams;
      for (const n of names) {
        expect(teams[teamId(n)], `${id}: ${n} -> ${teamId(n)}`).toBeDefined();
        expect(live(n), n).toBe(teamId(n));
      }
    }
  });
});

describe("the cup pages", () => {
  it("ask SportScore for their competition's live scores and credit it", () => {
    const out = site();
    const ask = { "champions-league": "uefa-champions-league", "europa-league": "uefa-europa-league", "conference-league": "uefa-europa-conference-league",
      "nations-league": "uefa-nations-league", afcon: "caf-africa-cup-of-nations" };
    for (const [id, competition] of Object.entries(ask)) {
      const html = readFileSync(join(out, "leagues", id, "index.html"), "utf8");
      expect(html, id).toContain(`data-sportscore="${competition}"`);
      expect(html, id).toContain('<script src="/leagues/live.js" defer></script>');
      expect(html, id).toContain('Live scores <a href="https://sportscore.com/">powered by SportScore</a>');
    }
    expect(readFileSync(join(out, "leagues/afcon/index.html"), "utf8")).toContain("Scores update every minute while games are on.");
  });

  it("never show a game of Israel's, even one SportScore sends while it is live", async () => {
    const out = site();
    const html = readFileSync(join(out, "leagues/nations-league/index.html"), "utf8");
    document.body.outerHTML = html.slice(html.indexOf("<body"), html.indexOf("</body>") + 7);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T19:30:00Z"));
    const fetchFn = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ matches: [
      { home: "Kosovo", away: "Israel", home_score: "1", away_score: "0", status: "live", status_text: "2nd half", url: "/football/match/kosovo-israel/x/" },
    ] }) }));
    (window as unknown as { fetch: unknown }).fetch = fetchFn;
    new Function(liveScript())();
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchFn.mock.calls[0]?.[0]).toContain("competition=uefa-nations-league");  // it did ask, and got the game
    expect(document.body.textContent).not.toMatch(/Israel/);
  });
});
