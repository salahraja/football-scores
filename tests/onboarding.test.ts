import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Onboarding from "../src/components/Onboarding.vue";
import HomeView from "../src/views/HomeView.vue";
import { loadFollowing, loadLeagues, loadPlayers, setupDone } from "../src/data/follow";

// Salah, 2026-11-25: "create an onboarding process for setting up for users, like teams, national teams, leagues, players". A first
// visit to Home opens a setup in four steps; every choice is kept on the device, as the stars were. Clubs and national teams go in the
// same following list the stars use, so a star and the setup agree.
const api: Record<string, unknown> = {
  "/api/v1/competitions.json": { competitions: [{ id: "it-1", name: "Serie A", current: "2026-27" }, { id: "en-1", name: "Premier League", current: "2026-27" }] },
  "/api/v1/tournaments.json": { tournaments: [{ id: "champions-league", name: "Champions League", teams: "clubs", season: "2026-27" },
    { id: "nations-league", name: "Nations League", teams: "nations", season: "2026-27" }] },
  "/api/v1/it-1/2026-27/teams.json": { teams: { juventus: "Juventus", inter: "Inter Milan" } },
  "/api/v1/en-1/2026-27/teams.json": { teams: { arsenal: "Arsenal" } },
  "/api/v1/champions-league/2026-27/teams.json": { teams: { juventus: "Juventus", galatasaray: "Galatasaray" } },
  "/api/v1/nations-league/2026-27/teams.json": { teams: { italy: "Italy", morocco: "Morocco" } },
  "/api/v1/it-1/2026-27/players.json": { players: [{ id: "1", name: "Dusan Vlahovic", team: "juventus", number: 9, position: "F" },
    { id: "2", name: "Kenan Yildiz", team: "juventus", number: 10, position: "F" }, { id: "3", name: "Lautaro Martinez", team: "inter", number: 10, position: "F" }] },
};
// Node 24 hides jsdom's localStorage behind its own (absent without a flag), so the page gets a plain stand-in, as in api-follow.test.ts
const memory = new Map<string, string>();
const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, String(v)),
  removeItem: (k: string) => void memory.delete(k), clear: () => memory.clear(), key: () => null, length: 0 };
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
  memory.clear();
  vi.stubGlobal("fetch", async (url: string) => (url in api ? { ok: true, json: async () => api[url] } : { ok: false, json: async () => ({}) }));
});
afterEach(() => vi.unstubAllGlobals());
const click = async (w: ReturnType<typeof mount>, sel: string) => { await w.get(sel).trigger("click"); await flushPromises(); };
const type = async (w: ReturnType<typeof mount>, sel: string, text: string) => { await w.get(sel).setValue(text); await flushPromises(); };

describe("the setup, step by step", () => {
  it("leagues, then clubs from them, then national teams, then players, and keeps every choice on the device", async () => {
    const w = mount(Onboarding, { attachTo: document.body });
    await flushPromises();
    expect(w.get('[data-test="setup-step"]').text()).toMatch(/leagues/i);
    await click(w, '[data-pick="it-1"]');
    await click(w, '[data-pick="champions-league"]');
    await click(w, '[data-test="setup-next"]');

    // clubs: the chosen leagues' and cups' clubs, each once; a search narrows them
    expect(w.get('[data-test="setup-step"]').text()).toMatch(/clubs/i);
    expect(w.findAll("[data-club]").map((b) => b.attributes("data-club"))).toEqual(["galatasaray", "inter", "juventus"]);
    await type(w, '[data-test="setup-search"]', "juv");
    expect(w.findAll("[data-club]").map((b) => b.attributes("data-club"))).toEqual(["juventus"]);
    await click(w, '[data-club="juventus"]');
    await click(w, '[data-test="setup-next"]');

    // national teams
    expect(w.get('[data-test="setup-step"]').text()).toMatch(/national/i);
    await click(w, '[data-club="italy"]');
    await click(w, '[data-test="setup-next"]');

    // players: found by name across the chosen leagues' squads, shown with their club
    expect(w.get('[data-test="setup-step"]').text()).toMatch(/players/i);
    await type(w, '[data-test="setup-search"]', "vlah");
    const found = w.findAll("[data-player]");
    expect(found).toHaveLength(1);
    expect(found[0].text()).toMatch(/Dusan Vlahovic[\s\S]*Juventus/);
    await click(w, '[data-player="1"]');
    await click(w, '[data-test="setup-done"]');

    expect(loadLeagues()).toEqual(["it-1", "champions-league"]);
    expect(loadFollowing()).toEqual(["juventus", "italy"]);
    expect(loadPlayers()).toEqual([{ id: "1", name: "Dusan Vlahovic", team: "juventus", league: "it-1", club: "Juventus" }]);
    expect(setupDone()).toBe(true);
    expect(w.emitted("done")).toHaveLength(1);
    w.unmount();
  });

  it("keeps the clubs already starred, and skipping saves nothing but the skip", async () => {
    window.localStorage.setItem("golboard.following", JSON.stringify(["arsenal"]));
    const w = mount(Onboarding, { attachTo: document.body });
    await flushPromises();
    await click(w, '[data-test="setup-skip"]');
    expect(loadFollowing()).toEqual(["arsenal"]);
    expect(loadLeagues()).toEqual([]);
    expect(setupDone()).toBe(true);
    w.unmount();
  });
});

describe("Home and the setup", () => {
  const home = () => mount(HomeView, { global: { stubs: { RouterLink: RouterLinkStub } }, attachTo: document.body });

  it("opens on a first visit, and not once it is done or skipped", async () => {
    let w = home();
    await flushPromises();
    expect(w.find('[data-test="setup"]').exists()).toBe(true);
    w.unmount();
    window.localStorage.setItem("golboard.setup", "done");
    w = home();
    await flushPromises();
    expect(w.find('[data-test="setup"]').exists()).toBe(false);
    w.unmount();
  });

  it("once done, Home opens on the first league chosen", async () => {
    window.history.replaceState(null, "", "/");
    const w = home();
    await flushPromises();
    window.localStorage.setItem("golboard.leagues", JSON.stringify(["en-1", "it-1"]));
    w.findComponent(Onboarding).vm.$emit("done");
    await flushPromises();
    expect(w.find('[data-test="setup"]').exists()).toBe(false);
    expect(new URL(window.location.href).searchParams.get("league")).toBe("en-1");
    w.unmount();
    window.history.replaceState(null, "", "/");
  });

  it("does not open for someone who already follows clubs", async () => {
    window.localStorage.setItem("golboard.following", JSON.stringify(["juventus"]));
    const w = home();
    await flushPromises();
    expect(w.find('[data-test="setup"]').exists()).toBe(false);
    w.unmount();
  });
});
