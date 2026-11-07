import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomeView from "../src/views/HomeView.vue";

// The homepage carries every league (Salah, 2026-11-07): Serie A first and from its fresher feed, the others from the site's own API.
const row = (team: string, position: number) => ({ position, team, played: 9, won: 8, drawn: 0, lost: 1, gf: 14, ga: 5, gd: 9, points: 24, adjustment: 0 });
const replies: Record<string, unknown> = {
  "competitions.json": { competitions: [{ id: "it-1", name: "Serie A", current: "2026-27" }, { id: "en-1", name: "Premier League", current: "2026-27" }] },
  "it-1/2026-27/table.json": { table: [row("juventus", 7)], zones: { zones: [{ kind: "cl", label: "Champions League", from: 1, to: 4 }, { kind: "rel", label: "Relegation", from: 18, to: 20 }], note: "" } },
  "it-1/2026-27/matches.json": { matches: [] },
  "it-1/2026-27/teams.json": { teams: { juventus: "Juventus" } },
  "en-1/2026-27/table.json": { table: [row("arsenal", 1)], zones: { zones: [{ kind: "cl", label: "Champions League", from: 1, to: 4 }], note: "A fifth place may go to England." } },
  "en-1/2026-27/matches.json": { matches: [{ id: "a", round: "Matchday 9", stage: "league", home: "newcastle-united", away: "arsenal", status: "finished", date: "2026-11-02", score: { ft: [0, 1] } }, { id: "b", round: "Matchday 10", stage: "league", home: "arsenal", away: "newcastle-united", status: "scheduled", date: "2026-11-09", score: null }] },
  "en-1/2026-27/teams.json": { teams: { arsenal: "Arsenal", "newcastle-united": "Newcastle United" } },
};
function stub(fail = "") {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const key = url.replace("/api/v1/", "");
    return key === fail || !(key in replies) ? { ok: false, status: 500 } : { ok: true, status: 200, json: async () => replies[key] };
  }));
}
const home = () => mount(HomeView, { global: { stubs: { RouterLink: RouterLinkStub } } });

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("the homepage's leagues", () => {
  it("offers each league, with Serie A chosen first", async () => {
    stub();
    const w = home();
    await flushPromises();
    expect(w.findAll('[data-test="league"]').map((b) => b.text())).toEqual(["Serie A", "Premier League"]);
    expect(w.get('[data-test="hero"]').text()).toContain("Serie A");
  });

  it("shows another league's table, results and links when it is chosen, and keeps it in the address", async () => {
    stub();
    const w = home();
    await flushPromises();
    await w.findAll('[data-test="league"]')[1].trigger("click");
    await flushPromises();
    expect(w.get('[data-test="hero"]').text()).toContain("Premier League");
    expect(w.get('[data-test="hero"]').text()).toContain("Newcastle United");
    expect(w.get('[data-test="hero"]').text()).toContain("Matchday 9");
    expect(w.get('[data-test="table"]').text()).toContain("Arsenal");
    expect(w.get('[data-test="table"] a.club').attributes("href")).toBe("/leagues/en-1/arsenal/");
    expect(w.findAll('[data-test="round"] .match')).toHaveLength(1);
    expect(window.location.search).toBe("?league=en-1");
  });

  it("walks the leagues with the arrows around the name, and goes round at the ends", async () => {
    stub();
    const w = home();
    await flushPromises();
    await w.get('[data-test="league-next"]').trigger("click");
    await flushPromises();
    expect(w.get('[data-test="hero"]').text()).toContain("Premier League");
    await w.get('[data-test="league-next"]').trigger("click");
    await flushPromises();
    expect(w.get('[data-test="hero"]').text()).toContain("Serie A");
    await w.get('[data-test="league-prev"]').trigger("click");
    await flushPromises();
    expect(w.get('[data-test="hero"]').text()).toContain("Premier League");
  });

  it("walks the round's games with the arrows around the result, and goes round", async () => {
    stub();
    const w = home();
    await flushPromises();
    const hero = () => w.get('[data-test="hero"]').text();
    const start = hero();
    await w.get('[data-test="game-next"]').trigger("click");
    expect(hero()).not.toBe(start);
    await w.get('[data-test="game-prev"]').trigger("click");
    expect(hero()).toBe(start);
    await w.get('[data-test="game-prev"]').trigger("click");
    expect(hero()).not.toBe(start);
  });

  it("leads with the game that is on, and lists today's games", async () => {
    stub();
    const fetchLive = vi.fn(async (url: string) => {
      if (url.includes("sportscore.com")) {
        if (!url.includes("english-premier-league")) return { ok: true, json: async () => ({ matches: [] }) };
        return { ok: true, json: async () => ({ matches: [
          { home: "Leeds United", away: "Tottenham Hotspur", home_score: "1", away_score: "0", status: "finished", status_text: "Finished", time: "2026-11-07T12:30:00+00:00" },
          { home: "Everton", away: "Fulham", home_score: "2", away_score: "2", status: "inprogress", status_text: "67'", time: "2026-11-07T15:00:00+00:00" },
          { home: "Arsenal", away: "Chelsea", home_score: null, away_score: null, status: "upcoming", time: "2026-11-07T17:30:00+00:00" },
        ] }) };
      }
      const key = url.replace("/api/v1/", "");
      return key in replies ? { ok: true, status: 200, json: async () => replies[key] } : { ok: false, status: 500 };
    });
    vi.stubGlobal("fetch", fetchLive);
    const w = home();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    const hero = w.get('[data-test="hero"]').text();
    expect(hero).toContain("Premier League");   // opened on the league with a game on
    expect(hero).toContain("Everton");
    expect(hero).toContain("2–2");
    expect(w.get('[data-test="state"]').text()).toBe("Live · 67'");
    expect(w.findAll('[data-test="round"] .match')).toHaveLength(3);
    expect(w.get('[data-test="round"]').text()).toContain("Today");
    expect(hero).toContain("SportScore");
  });

  const swipe = async (el: { trigger: (t: string, o: object) => Promise<void> }, from: number[], to: number[]) => {
    await el.trigger("touchstart", { changedTouches: [{ clientX: from[0], clientY: from[1] }] });
    await el.trigger("touchend", { changedTouches: [{ clientX: to[0], clientY: to[1] }] });
    await flushPromises();
  };

  it("swipes between leagues on the poster and between games on the score", async () => {
    stub();
    const w = home();
    await flushPromises();
    await swipe(w.get(".poster__titlebar"), [300, 200], [100, 205]);
    expect(w.get('[data-test="hero"]').text()).toContain("Premier League");
    await swipe(w.get(".poster__titlebar"), [100, 200], [300, 205]);
    expect(w.get('[data-test="hero"]').text()).toContain("Serie A");
    const before = w.get(".poster__result").text();
    await swipe(w.get(".poster__result"), [300, 400], [100, 400]);
    expect(w.get(".poster__result").text()).not.toBe(before);
    expect(w.get('[data-test="hero"]').text()).toContain("Serie A");
  });

  it("leaves an up or down drag alone, and a short one", async () => {
    stub();
    const w = home();
    await flushPromises();
    const before = w.get('[data-test="hero"]').text();
    await swipe(w.get(".poster__titlebar"), [200, 500], [150, 200]);
    await swipe(w.get(".poster__titlebar"), [200, 200], [170, 200]);
    expect(w.get('[data-test="hero"]').text()).toBe(before);
  });

  it("keeps today's games for every league, whichever answers first", async () => {
    let release: () => void = () => {};
    const late = new Promise<void>((r) => (release = r));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("italian-serie-a")) {
        await late; // Serie A answers last, and must not wipe the Premier League
        return { ok: true, json: async () => ({ matches: [{ home: "Roma", away: "Lazio", home_score: "1", away_score: "1", status: "finished", time: "2026-11-07T12:00:00+00:00" }] }) };
      }
      if (url.includes("english-premier-league")) return { ok: true, json: async () => ({ matches: [{ home: "Leeds United", away: "Tottenham Hotspur", home_score: "1", away_score: "0", status: "finished", time: "2026-11-07T12:30:00+00:00" }] }) };
      if (url.includes("sportscore.com")) return { ok: true, json: async () => ({ matches: [] }) };
      const key = url.replace("/api/v1/", "");
      return key in replies ? { ok: true, status: 200, json: async () => replies[key] } : { ok: false, status: 500 };
    }));
    const w = home();
    await flushPromises();
    await flushPromises();
    release();
    await flushPromises();
    await flushPromises();
    expect(w.get('[data-test="hero"]').text()).toContain("Roma");
    await w.get('[data-test="league-next"]').trigger("click");
    await flushPromises();
    expect(w.get('[data-test="hero"]').text()).toContain("Leeds United");
    expect(w.get('[data-test="state"]').text()).toBe("Full time");
  });

  it("says what each place in the table leads to, in words", async () => {
    stub();
    const w = home();
    await flushPromises();
    expect(w.get('[data-test="zones"]').text()).toContain("1–4 Champions League");
    expect(w.get('[data-test="zones"]').text()).toContain("18–20 Relegation");
  });

  it("opens the league in the address", async () => {
    stub();
    window.history.replaceState(null, "", "/?league=en-1");
    const w = home();
    await flushPromises();
    expect(w.get('[data-test="hero"]').text()).toContain("Premier League");
  });

  it("keeps Serie A on screen when the API cannot be read", async () => {
    stub("competitions.json");
    const w = home();
    await flushPromises();
    expect(w.find('[data-test="leagues"]').exists()).toBe(false);
    expect(w.get('[data-test="hero"]').text()).toContain("Serie A");
  });

  it("says so when one league cannot be read, and stays on what it had", async () => {
    stub("en-1/2026-27/table.json");
    const w = home();
    await flushPromises();
    await w.findAll('[data-test="league"]')[1].trigger("click");
    await flushPromises();
    expect(w.find('[data-test="league-failed"]').exists()).toBe(true);
    expect(w.get('[data-test="hero"]').text()).toContain("Serie A");
  });
});
