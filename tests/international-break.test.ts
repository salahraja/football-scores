import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomeView from "../src/views/HomeView.vue";
import { breakCups, cupGames, type DayMatch } from "../src/data/internationals";

// Salah, 2026-11-17, on the homepage during the November window: "It's international break, we should be able to recognize that and
// display the UEFA and AFCON matches." No club league plays from yesterday to tomorrow while a nations' tournament does: that is a break,
// and the poster opens on the internationals.
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const TODAY = day(0);
const m = (league: string, date: string, home: string, away: string, status: string, ft: [number, number] | null, round = "League A, Group 4"): DayMatch => ({
  league, round, date, time: "20:45", kickoff: `${date}T20:45:00+01:00`, home: home.toLowerCase(), away: away.toLowerCase(), status, score: ft ? { ft } : null, homeName: home, awayName: away,
});
const CUPS = [
  { id: "afcon", name: "AFCON qualifying", teams: "nations", season: "2026-27" },
  { id: "champions-league", name: "Champions League", teams: "clubs", season: "2026-27" },
  { id: "nations-league", name: "Nations League", teams: "nations", season: "2026-27" },
];
const LEAGUES = ["it-1", "en-1"];

describe("recognising an international break", () => {
  it("is a break when no club league plays from yesterday to tomorrow and a nations' tournament does; Nations League leads", () => {
    const games = [m("afcon", TODAY, "Malawi", "Egypt", "scheduled", null, "Group C"), m("nations-league", day(-1), "Germany", "Netherlands", "finished", [5, 0]), m("it-1", day(3), "Juventus", "Inter", "scheduled", null)];
    expect(breakCups(games, CUPS, LEAGUES, TODAY).map((c) => c.id)).toEqual(["nations-league", "afcon"]);
  });
  it("is not a break while a club league still plays in the window, and club cups never count", () => {
    expect(breakCups([m("nations-league", TODAY, "Wales", "Portugal", "scheduled", null), m("en-1", day(1), "Arsenal", "Chelsea", "scheduled", null)], CUPS, LEAGUES, TODAY)).toEqual([]);
    expect(breakCups([m("champions-league", TODAY, "Juventus", "Ajax", "scheduled", null)], CUPS, LEAGUES, TODAY)).toEqual([]);
  });
  it("shows a cup's games of today, or yesterday's results when today has none, with the group in the line under the score", () => {
    const games = [m("nations-league", day(-1), "Germany", "Netherlands", "finished", [5, 0], "League A, Group 2"), m("nations-league", TODAY, "Wales", "Portugal", "scheduled", null)];
    const now = cupGames(games, "nations-league", TODAY);
    expect(now.map((g) => [g.home, g.away, g.status])).toEqual([["Wales", "Portugal", "upcoming"]]);
    expect(now[0].text).toMatch(/^League A, Group 4 · Today /);
    const before = cupGames(games.slice(0, 1), "nations-league", TODAY);
    expect(before[0]).toMatchObject({ home: "Germany", away: "Netherlands", score: [5, 0], status: "finished", text: "League A, Group 2 · Yesterday" });
  });
});

const replies: Record<string, unknown> = {
  "competitions.json": { competitions: [{ id: "it-1", name: "Serie A", current: "2026-27" }, { id: "en-1", name: "Premier League", current: "2026-27" }] },
  "it-1/2026-27/table.json": { table: [], zones: { zones: [], note: "" } },
  "it-1/2026-27/matches.json": { matches: [] },
  "it-1/2026-27/teams.json": { teams: {} },
  "tournaments.json": { tournaments: CUPS },
  "today.json": { from: day(-1), to: day(3), matches: [m("nations-league", day(-1), "Germany", "Netherlands", "finished", [5, 0], "League A, Group 2"), m("afcon", day(-1), "Sudan", "Senegal", "finished", [2, 4], "Group J"), m("it-1", day(3), "Juventus", "Inter", "scheduled", null)] },
  "nations-league/2026-27/groups.json": { groups: [{ group: "A2", name: "League A, Group 2", table: [{ position: 1, team: "germany", played: 6, won: 5, drawn: 1, lost: 0, points: 16 }, { position: 2, team: "netherlands", played: 6, won: 2, drawn: 1, lost: 3, points: 7 }] }] },
  "nations-league/2026-27/teams.json": { teams: { germany: "Germany", netherlands: "Netherlands" } },
};
function stub() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const key = url.replace("/api/v1/", "");
    return key in replies ? { ok: true, status: 200, json: async () => replies[key] } : { ok: false, status: 500 };
  }));
}
const home = () => mount(HomeView, { global: { stubs: { RouterLink: RouterLinkStub } } });
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("the homepage in an international break", () => {
  it("opens on the Nations League, offers the internationals before the leagues, and shows the group's table", async () => {
    stub();
    const w = home();
    await flushPromises();
    expect(w.findAll('[data-test="league"]').map((b) => b.text())).toEqual(["Nations League", "AFCON qualifying", "Serie A", "Premier League"]);
    const hero = w.get('[data-test="hero"]').text();
    expect(w.get(".poster__title").attributes("aria-label")).toBe("Nations League");
    expect(hero).toContain("Germany");
    expect(hero).toContain("League A, Group 2 · Yesterday");
    expect(w.get('[data-test="table"]').text()).toContain("League A, Group 2");
    expect(w.get('[data-test="table"]').text()).toContain("Netherlands");
    expect(w.get('[data-test="table"] a.more').attributes("href")).toBe("/leagues/nations-league/");
  });
  it("opens on an international that is live now, ahead of the Nations League (live scores show first)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("caf-africa-cup-of-nations")) return { ok: true, status: 200, json: async () => ({ matches: [{ home: "Malawi", away: "Egypt", home_score: "0", away_score: "1", status: "live", status_text: "55'", time: `${TODAY}T13:00:00Z` }] }) };
      const key = url.replace("/api/v1/", "");
      return key in replies ? { ok: true, status: 200, json: async () => replies[key] } : { ok: false, status: 500 };
    }));
    const w = home();
    await flushPromises();
    expect(w.get(".poster__title").attributes("aria-label")).toBe("AFCON qualifying");
    expect(w.get('[data-test="hero"]').text()).toContain("Egypt");
  });
  it("keeps the league the address asks for", async () => {
    stub();
    window.history.replaceState(null, "", "/?league=it-1");
    const w = home();
    await flushPromises();
    expect(w.get(".poster__title").attributes("aria-label")).toBe("Serie A");
  });
});

describe("the internationals' live scores", () => {
  it("reads the Nations League and AFCON from SportScore, and never shows a game of Israel's", async () => {
    const { today } = await import("../src/data/live");
    const asked: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      asked.push(url);
      return { ok: true, status: 200, json: async () => ({ matches: [
        { home: "Wales", away: "Portugal", home_score: "1", away_score: "0", status: "live", status_text: "34'", time: `${TODAY}T19:45:00Z` },
        { home: "Israel", away: "Kosovo", home_score: "0", away_score: "0", status: "live", status_text: "10'", time: `${TODAY}T19:45:00Z` },
      ] }) };
    }));
    const got = await today("nations-league", TODAY);
    expect(got.map((g) => g.home)).toEqual(["Wales"]);
    await today("afcon", TODAY);
    expect(asked[0]).toContain("competition=uefa-nations-league");
    expect(asked[1]).toContain("competition=caf-africa-cup-of-nations");
  });
});
