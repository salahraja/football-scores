import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Onboarding from "../src/components/Onboarding.vue";

// Salah, 2026-11-26, searching "Maza" with Serie A chosen: "You should be able to look up any player". The player step searched only
// the leagues chosen in step 1; it now searches every league, with the chosen leagues' players first.
const api: Record<string, unknown> = {
  "/api/v1/competitions.json": { competitions: [{ id: "it-1", name: "Serie A", current: "2026-27" }, { id: "de-1", name: "Bundesliga", current: "2026-27" }] },
  "/api/v1/tournaments.json": { tournaments: [] },
  "/api/v1/it-1/2026-27/teams.json": { teams: { juventus: "Juventus" } },
  "/api/v1/de-1/2026-27/teams.json": { teams: { "bayer-leverkusen": "Bayer Leverkusen" } },
  "/api/v1/it-1/2026-27/players.json": { players: [{ id: "1", name: "Mazza Rossi", team: "juventus", number: 4, position: "D" }] },
  "/api/v1/de-1/2026-27/players.json": { players: [{ id: "2", name: "Ibrahim Maza", team: "bayer-leverkusen", number: 30, position: "M" }] },
};
const memory = new Map<string, string>();
const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, String(v)),
  removeItem: (k: string) => void memory.delete(k), clear: () => memory.clear(), key: () => null, length: 0 };
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
  memory.clear();
  vi.stubGlobal("fetch", async (url: string) => (url in api ? { ok: true, json: async () => api[url] } : { ok: false, json: async () => ({}) }));
});
afterEach(() => vi.unstubAllGlobals());

describe("the player step searches every league", () => {
  it("finds a Bundesliga player with only Serie A chosen, the chosen league's players listed first", async () => {
    const w = mount(Onboarding, { attachTo: document.body });
    await flushPromises();
    await w.get('[data-pick="it-1"]').trigger("click");
    for (let i = 0; i < 3; i++) { await w.get('[data-test="setup-next"]').trigger("click"); await flushPromises(); }
    await w.get('[data-test="setup-search"]').setValue("maz");
    await flushPromises();
    const found = w.findAll("[data-player]").map((b) => b.text().replace(/\s+/g, " "));
    expect(found).toHaveLength(2);
    expect(found[0]).toMatch(/Mazza Rossi\s*Juventus/);
    expect(found[1]).toMatch(/Ibrahim Maza\s*Bayer Leverkusen/);
    await w.get('[data-test="setup-search"]').setValue("zzz");
    await flushPromises();
    expect(w.text()).toContain("No player by that name.");
    w.unmount();
  });
});
