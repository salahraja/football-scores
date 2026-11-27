import { existsSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

// Salah, 2026-11-26: "Let's do 5, with 2, 3, 4 and Premitive as onboarding options." The big red display text uses a poster font
// (Neloich by default; Taller, Raceday, Chalerist or Primate if picked in the setup). The fonts are personal-use only, so their files
// are never committed: public/poster-font.js offers only the fonts whose file loads, and leaves the site in Barlow when none does.
const path = "public/poster-font.js";
const script = existsSync(path) ? readFileSync(path, "utf8") : "";
const memory = new Map<string, string>();
const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, String(v)),
  removeItem: (k: string) => void memory.delete(k), clear: () => memory.clear() };

// jsdom has no FontFace: a stand-in that loads only the files in `present`
let present = new Set<string>();
class FakeFace { family: string; url: string; constructor(family: string, src: string) { this.family = family; this.url = /url\(([^)]+)\)/.exec(src)?.[1] ?? ""; }
  load() { return present.has(this.url) ? Promise.resolve(this) : Promise.reject(new Error("missing")); } }

type Api = { fonts: { id: string; name: string; file: string; spacing: boolean }[]; current(): string; set(id: string): Promise<void>;
  available(): Promise<string[]>; rule: { strokeFor(stem: number, cap: number, gap: number): number; growFor(before: number, after: number, most: number): number } };
const api = () => (window as unknown as { golboardPosterFont: Api }).golboardPosterFont;

function load() {
  document.body.innerHTML = '<h1 class="titlebar">Serie A</h1>';
  new Function(script)();
}

describe("the poster font", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
    Object.defineProperty(window, "FontFace", { value: FakeFace, configurable: true });
    Object.defineProperty(document, "fonts", { value: { add() {}, ready: Promise.resolve() }, configurable: true });
    memory.clear(); present = new Set();
    load();
  });

  it("offers Neloich, Taller, Raceday, Chalerist and Primate, Neloich first and by default", () => {
    expect(api().fonts.map((f) => f.id)).toEqual(["neloich", "taller", "raceday", "chalerist", "primate"]);
    expect(api().current()).toBe("neloich");
  });

  it("keeps Primate's own spacing (its joined letters are its look) and spaces the others with their extra stroke", () => {
    expect(Object.fromEntries(api().fonts.map((f) => [f.id, f.spacing]))).toEqual({ neloich: true, taller: true, raceday: true, chalerist: true, primate: false });
  });

  it("remembers a pick on the device, and an unknown pick falls back to the default", async () => {
    await api().set("raceday");
    expect(memory.get("golboard.posterFont")).toBe("raceday");
    expect(api().current()).toBe("raceday");
    memory.set("golboard.posterFont", "comic-sans");
    expect(api().current()).toBe("neloich");
  });

  it("offers only the fonts whose file loads, so a site without the files offers none", async () => {
    expect(await api().available()).toEqual([]);
    present = new Set(["/fonts/poster/taller.otf", "/fonts/poster/primate.otf"]);
    expect(await api().available()).toEqual(["taller", "primate"]);
  });

  it("leaves the page untouched when the font's file is missing", async () => {
    await api().set("taller");
    expect(document.querySelector("h1")!.getAttribute("style")).toBeNull();
  });

  it("thickens a font toward a stroke of 12% of its letter height, never closing a quarter of its tightest inner gap", () => {
    const { strokeFor } = api().rule;
    expect(strokeFor(14, 136, 10)).toBeCloseTo((0.12 * 136 - 14) / 200, 6); // Rayeon: thinner than 12%, room to grow
    expect(strokeFor(11, 136, 4)).toBeCloseTo((0.25 * 4) / 200, 6); // Repetic: the gap stops it first
    expect(strokeFor(24, 150, 4)).toBe(0); // Neloich: already bolder than 12%
  });

  it("grows text back to the width it had in Barlow, at most 1.6 times, and never shrinks below its size unless it would overflow", () => {
    const { growFor } = api().rule;
    expect(growFor(300, 150, 1.6)).toBe(1.6);
    expect(growFor(300, 250, 1.6)).toBeCloseTo(1.2, 6);
    expect(growFor(300, 360, 1.6)).toBeCloseTo(300 / 360, 6); // wider than Barlow: shrinks to fit its space
  });
});

describe("where the poster font loads", () => {
  it("every generated league, club and game page asks for it through follow.js, which they all load", async () => {
    const { followScript } = await import("../scripts/api/pages.mjs");
    document.head.innerHTML = ""; document.body.innerHTML = "";
    new Function(followScript())();
    expect(document.head.querySelectorAll('script[src="/poster-font.js"]').length).toBe(1);
    new Function(followScript())();
    expect(document.head.querySelectorAll('script[src="/poster-font.js"]').length).toBe(1);
  });

  it("the app's pages load it in their head", () => {
    expect(readFileSync("src/layouts/Page.astro", "utf8")).toMatch(/<script is:inline src="\/poster-font\.js" defer><\/script>/);
  });
});

describe("text that shows a font on purpose", () => {
  it("is left alone: the setup marks its font names data-pf-skip", () => {
    expect(script).toMatch(/closest\("\[data-pf-skip\]"\)/);
    expect(readFileSync("src/components/Onboarding.vue", "utf8")).toMatch(/data-test="setup-fonts" data-pf-skip/);
  });
});

// Salah, 2026-11-26: "The numbers should stay the same." Scores and kick-off times keep today's Barlow, size and weight.
describe("numbers", () => {
  it("are never drawn in a poster font: its file is registered without digits, the colon or dashes", async () => {
    const seen: string[] = [];
    class Spy extends FakeFace { constructor(family: string, src: string, d?: { unicodeRange?: string }) { super(family, src); seen.push(d?.unicodeRange ?? ""); } }
    Object.defineProperty(window, "FontFace", { value: Spy, configurable: true });
    delete (window as unknown as { golboardPosterFont?: unknown }).golboardPosterFont; load();
    await api().available();
    expect(seen.length).toBe(5);
    for (const range of seen) { expect(range).not.toBe(""); expect(range).not.toMatch(/U\+0-FFFF/); expect(range).toMatch(/U\+3B-/); }
  });

  it("text that is only a score or a time is told apart from a name with a number in it", () => {
    const { isNumber } = api().rule as unknown as { isNumber(t: string): boolean };
    for (const t of ["2-1", "1–0", "12:30", " 15:00 ", "3 – 2"]) expect(isNumber(t)).toBe(true);
    for (const t of ["Ligue 1", "Serie A", "FT", ""]) expect(isNumber(t)).toBe(false);
  });
});
