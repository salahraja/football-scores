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

  it("walks the leagues with the arrows, and goes round at the ends", async () => {
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
