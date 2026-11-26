import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Onboarding from "../src/components/Onboarding.vue";

// Salah, 2026-11-26: "Let's do 5, with 2, 3, 4 and Premitive as onboarding options." The setup's first step offers the poster fonts
// whose files are on the site (public/poster-font.js), each name shown in its own font; a tap switches the page's red text at once.
const api: Record<string, unknown> = {
  "/api/v1/competitions.json": { competitions: [{ id: "it-1", name: "Serie A", current: "2026-27" }] },
  "/api/v1/tournaments.json": { tournaments: [] },
};
const set = vi.fn(async (_id: string) => {});
const fonts = [{ id: "neloich", name: "Neloich", file: "neloich.ttf", spacing: true }, { id: "taller", name: "Taller", file: "taller.otf", spacing: true },
  { id: "raceday", name: "Raceday", file: "raceday.otf", spacing: true }, { id: "chalerist", name: "Chalerist", file: "chalerist.ttf", spacing: true },
  { id: "primate", name: "Primate", file: "primate.otf", spacing: false }];
let available: string[] = [];
let picked = "neloich";
beforeEach(() => {
  available = []; picked = "neloich"; set.mockClear();
  vi.stubGlobal("fetch", async (url: string) => (url in api ? { ok: true, json: async () => api[url] } : { ok: false, json: async () => ({}) }));
  (window as unknown as { golboardPosterFont: unknown }).golboardPosterFont = { fonts, current: () => picked,
    available: async () => available, set: async (id: string) => { picked = id; await set(id); } };
});
afterEach(() => { vi.unstubAllGlobals(); delete (window as unknown as { golboardPosterFont?: unknown }).golboardPosterFont; });

describe("the setup's poster font choice", () => {
  it("shows the fonts that are on the site, each in its own font, with the current one pressed", async () => {
    available = ["neloich", "raceday", "primate"];
    const w = mount(Onboarding);
    await flushPromises();
    const chips = w.findAll("[data-font]");
    expect(chips.map((c) => c.attributes("data-font"))).toEqual(["neloich", "raceday", "primate"]);
    expect(chips.map((c) => c.attributes("aria-pressed"))).toEqual(["true", "false", "false"]);
    expect(chips[1].attributes("style")).toMatch(/golboard-poster-raceday/);
  });

  it("switches the font when one is tapped, and presses it", async () => {
    available = ["neloich", "raceday"];
    const w = mount(Onboarding);
    await flushPromises();
    await w.get('[data-font="raceday"]').trigger("click");
    await flushPromises();
    expect(set).toHaveBeenCalledWith("raceday");
    expect(w.get('[data-font="raceday"]').attributes("aria-pressed")).toBe("true");
  });

  it("shows no font choice when no font file is on the site", async () => {
    const w = mount(Onboarding);
    await flushPromises();
    expect(w.find('[data-test="setup-fonts"]').exists()).toBe(false);
  });
});
