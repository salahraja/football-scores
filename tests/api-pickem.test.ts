// @vitest-environment jsdom
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { pages } from "../scripts/api/pages.mjs";
import { clean, progress, resolve, sideLabel, thirdsFor } from "../scripts/api/pickem.mjs";
import { inlineScripts } from "../scripts/csp.mjs";

// Bracket pick'em (Salah, 2026-11-15): rank every group, pick the best thirds, then pick a winner round by round to the final.
// No money, no odds; the picks stay on the device. The first bracket is a practice one on the real AFCON 2025 draw.
type Picks = { groups: Record<string, string[]>; thirds: string[]; ko: Record<string, string> };
const DATA = JSON.parse(readFileSync("tests/fixtures/pickem-knockout.json", "utf8"));   // the 2025 practice bracket, off the site since 2026-11-15
const SIX = DATA.formats["six-four"];
const AFCON = DATA.brackets.find((b: { id: string }) => b.id === "afcon-2025");
const ctx = { ...AFCON, format: SIX };
// how the 2025 groups really finished, and the four thirds that went through (Wikipedia, 2025 Africa Cup of Nations)
const REAL: Picks = {
  groups: { A: ["MAR", "MLI", "COM", "ZAM"], B: ["EGY", "RSA", "ANG", "ZIM"], C: ["NGA", "TUN", "TAN", "UGA"],
    D: ["SEN", "DRC", "BEN", "BOT"], E: ["ALG", "BFA", "SDN", "EQG"], F: ["CIV", "CMR", "MOZ", "GAB"] },
  thirds: ["C", "D", "E", "F"], ko: {} };
const copy = (p: Picks): Picks => JSON.parse(JSON.stringify(p));
const sides = (picks: Picks, round: number) => resolve(ctx, picks)[round].matches.map((m: { a: { team: string | null }; b: { team: string | null } }) => `${m.a.team}-${m.b.team}`);

describe("the six-group format", () => {
  it("has a row for every set of four thirds, each meeting a winner from another group", () => {
    const sets = Object.keys(SIX.table);
    expect(sets).toHaveLength(15);
    for (const set of sets) {
      expect([...SIX.table[set]].sort().join("")).toBe(set);
      SIX.thirdsVs.forEach((w: string, i: number) => expect(SIX.table[set][i], `${set} ${w}`).not.toBe(w[1]));
    }
  });

  it("names each third's place as the regulations do before the groups are picked", () => {
    expect(["1A", "1B", "1C", "1D"].map((w) => sideLabel(SIX, `3vs${w}`))).toEqual(["3rd C/D/E", "3rd A/C/D", "3rd A/B/F", "3rd B/E/F"]);
    expect(sideLabel(SIX, "2C")).toBe("2nd C");
    expect(sideLabel(SIX, "1A")).toBe("1st A");
  });

  it("gives the real last 16 of AFCON 2025 from the real group results", () => {
    expect(thirdsFor(SIX, ["F", "C", "E", "D"])).toEqual({ "3vs1A": "C", "3vs1B": "D", "3vs1C": "F", "3vs1D": "E" });
    expect(sides(REAL, 0)).toEqual(["SEN-SDN", "MLI-TUN", "MAR-TAN", "RSA-CMR", "EGY-BEN", "NGA-MOZ", "ALG-DRC", "CIV-BFA"]);
  });
});

describe("picking", () => {
  it("knows no team until its group is ranked, and no third until four are chosen", () => {
    const empty: Picks = { groups: {}, thirds: [], ko: {} };
    const first = resolve(ctx, empty)[0].matches[0];
    expect([first.a.team, first.a.label, first.b.team, first.b.label]).toEqual([null, "1st D", null, "3rd B/E/F"]);
    const groupsOnly = copy(REAL); groupsOnly.thirds = ["C", "D"];
    expect(resolve(ctx, groupsOnly)[0].matches[0].a.team).toBe("SEN");
    expect(resolve(ctx, groupsOnly)[0].matches[0].b.team).toBe(null);
  });

  it("carries each winner into the next round", () => {
    const p = copy(REAL); p.ko = { "R16-1": "SEN", "R16-2": "MLI" };
    expect(sides(p, 1)[0]).toBe("SEN-MLI");
  });

  it("drops a pick, and everything that hung on it, when a group change makes it impossible", () => {
    const p = copy(REAL); p.ko = { "R16-3": "MAR", "R16-4": "CMR", "QF-2": "MAR", "R16-1": "SEN" };
    p.groups.A = ["MLI", "COM", "MAR", "ZAM"];   // Morocco now third in A, and A's third is not through
    const c = clean(ctx, p);
    expect(c.ko).toEqual({ "R16-4": "CMR", "R16-1": "SEN" });
  });

  it("only counts thirds from finished groups, and at most four", () => {
    const p = copy(REAL); p.groups.F = ["CIV"]; p.thirds = ["A", "B", "C", "D", "F"];
    expect(clean(ctx, p).thirds).toEqual(["A", "B", "C", "D"]);
  });

  it("counts every group, the thirds and every game as one step each", () => {
    expect(progress(ctx, { groups: {}, thirds: [], ko: {} })).toEqual({ done: 0, total: 22 });
    const p = copy(REAL); p.ko = { "R16-1": "SEN" };
    expect(progress(ctx, p)).toEqual({ done: 8, total: 22 });
  });
});

// ---- the page
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-pickem-")); dirs.push(d); return d; };
afterAll(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
function site(pickem?: unknown) {
  const out = tmp();
  build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), out, seasons: ["2025-26"], now: "2026-10-31T17:00:00Z" });
  pages({ api: join(out, "api/v1"), out, pickem: pickem ?? DATA });
  return out;
}
const read = (out: string, path: string) => readFileSync(join(out, path), "utf8");
const out = site();
const PAGE = "leagues/bracket/afcon-2025/index.html";

describe("the bracket page", () => {
  it("is built for each bracket, loads pickem.js from the site and runs no inline script", () => {
    const html = read(out, PAGE);
    expect(html).toContain("<title>AFCON 2025 bracket | golboard</title>");
    expect(html).toContain('<script src="/leagues/pickem.js" defer></script>');
    expect(inlineScripts(html).filter((s: string) => !s.includes('"@context"'))).toEqual([]);
    expect(html).toContain('<script type="application/json" id="bracket-data">');
    expect(html).toContain("practice bracket");
    expect(html).toMatch(/no money/i);
    expect(read(out, "leagues/pickem.js")).toContain("golboard.pickem.");
  });

  it("is linked from the leagues page and the sitemap", () => {
    expect(read(out, "leagues/index.html")).toMatch(/<a class="glass" href="\/leagues\/bracket\/afcon-2025\/"><b>AFCON 2025<\/b>/);
    expect(read(out, "sitemap.xml")).toContain("/leagues/bracket/afcon-2025/</loc>");
  });

  it("never shows a hidden nation", () => {
    const withIsr = JSON.parse(JSON.stringify(DATA));
    withIsr.brackets.find((b: { id: string }) => b.id === "afcon-2025").groups.A = ["MAR", "ISR", "ZAM", "COM"];
    const html = read(site(withIsr), PAGE);
    expect(html).not.toContain("ISR");
    expect(html).not.toContain("Israel");
  });
});

// ---- the script, on the real page
const SCRIPT = read(out, "leagues/pickem.js");
const BODY = /<body[^>]*>([\s\S]*)<\/body>/.exec(read(out, PAGE))![1];
const KEY = "golboard.pickem.afcon-2025";
// Node 24 hides jsdom's localStorage behind its own (absent without a flag), so the page gets a plain stand-in, as in api-follow
const memory = new Map<string, string>();
const localStorage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, String(v)), clear: () => memory.clear() };
const load = () => { document.body.innerHTML = BODY; (0, eval)(SCRIPT); };
const click = (el: Element | null) => { expect(el).not.toBeNull(); el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
const $ = (sel: string) => document.querySelector(sel);
const rank = (g: string, teams: string[]) => teams.forEach((t) => click($(`[data-group="${g}"] [data-team="${t}"]`)));
const saved = () => JSON.parse(localStorage.getItem(KEY) ?? "null");

describe("pickem.js", () => {
  beforeEach(() => { Object.defineProperty(window, "localStorage", { value: localStorage, configurable: true }); memory.clear(); });

  it("ranks a group in the order you tap, marks the top two through, and keeps it on the device", () => {
    load();
    rank("A", ["MAR", "MLI"]);
    expect($('[data-group="A"] [data-team="MAR"]')!.getAttribute("data-rank")).toBe("1");
    expect($('[data-group="A"] [data-team="MLI"]')!.getAttribute("data-rank")).toBe("2");
    expect($('[data-group="A"] [data-team="MAR"]')!.textContent).toContain("Through");
    expect(saved().groups.A).toEqual(["MAR", "MLI"]);
    load();
    expect($('[data-group="A"] [data-team="MLI"]')!.getAttribute("data-rank")).toBe("2");
  });

  it("takes a team, and those after it, back out when you tap it again", () => {
    load();
    rank("A", ["MAR", "MLI", "COM", "MAR"]);
    expect(saved().groups.A).toEqual([]);
  });

  it("finishes a group's last place by itself", () => {
    load();
    rank("B", ["EGY", "RSA", "ANG"]);
    expect(saved().groups.B).toEqual(["EGY", "RSA", "ANG", "ZIM"]);
  });

  it("asks for the best thirds once every group is ranked, then fills the last 16, and carries picks to a champion", () => {
    load();
    for (const [g, order] of Object.entries(REAL.groups)) rank(g, order.slice(0, 3));
    for (const g of ["C", "D", "E", "F"]) click($(`[data-third="${g}"]`));
    expect(saved().thirds.sort()).toEqual(["C", "D", "E", "F"]);
    click($('[data-tab="1"]'));
    expect($('[data-match="R16-1"]')!.textContent).toContain("Senegal");
    expect($('[data-match="R16-1"]')!.textContent).toContain("Sudan");
    const path: Record<string, string> = { "R16-1": "SEN", "R16-2": "MLI", "R16-3": "MAR", "R16-4": "CMR", "R16-5": "EGY", "R16-6": "NGA",
      "R16-7": "ALG", "R16-8": "CIV", "QF-1": "SEN", "QF-2": "MAR", "QF-3": "NGA", "QF-4": "EGY", "SF-1": "SEN", "SF-2": "MAR", F: "SEN" };
    const tabOf: Record<string, string> = { R16: "1", QF: "2", SF: "3", F: "4" };
    for (const [id, team] of Object.entries(path)) {
      click($(`.tabs [data-tab="${tabOf[id.split("-")[0]]}"]`));
      click($(`[data-match="${id}"] [data-team="${team}"]`));
    }
    expect(saved().ko).toEqual(path);
    expect($("#champion")!.textContent).toContain("Senegal");
    expect($(".bar i")!.getAttribute("style")).toContain("100%");
  });

  it("clears the knockout picks a group change has made impossible", () => {
    localStorage.setItem(KEY, JSON.stringify({ ...REAL, ko: { "R16-3": "MAR", "R16-1": "SEN" } }));
    load();
    rank("A", ["MAR"]);                          // tap Morocco: A is unranked again
    expect(saved().ko).toEqual({ "R16-1": "SEN" });
  });

  it("starts again only on a second tap", () => {
    localStorage.setItem(KEY, JSON.stringify(REAL));
    load();
    click($("#start-over"));
    expect(saved().groups.A).toHaveLength(4);
    click($("#start-over"));
    expect(Object.values(saved().groups).flat()).toEqual([]);
    expect([saved().thirds, saved().ko]).toEqual([[], {}]);
  });
});

// "The depressed look when you click needs adjusting on dark mode" (Salah, 2026-11-15): on the dark card the picked row was lighter than
// the card with a 90% white lip, so it read as raised. In dark it sits darker than the card, with a faint lip.
describe("a picked row in dark mode", () => {
  it("has its own dark rule: darker than the card, with no bright lip", async () => {
    const css = (await import("node:fs")).readFileSync("scripts/api/pages.mjs", "utf8");
    const dark = /@media \(prefers-color-scheme: dark\) \{ \.pickem \.pick\.through \{([^}]*)\}/.exec(css);
    expect(dark).not.toBeNull();
    expect(dark![1]).not.toMatch(/255 255 255 \/ (9|8|7|6|5|4|3|2)\d%/);
    expect(dark![1]).toMatch(/background: #1[0-9a-f]{5}/);
  });
});

// "Remove AFCON 2025 and add UEFA Nations League" (Salah, 2026-11-15)
describe("the published brackets", () => {
  it("no longer list the AFCON 2025 practice bracket, and have the Nations League, every league", () => {
    const live = JSON.parse(readFileSync("data/api/pickem.json", "utf8"));
    const ids = live.brackets.map((b: { id: string }) => b.id);
    expect(ids).not.toContain("afcon-2025");
    expect(live.brackets.find((b: { id: string }) => b.id === "nations-league-2027")).toMatchObject({ kind: "qualify", tournament: "nations-league" });
    expect(live.brackets.find((b: { id: string }) => b.id === "nations-league-2027").division).toBeUndefined();   // every league, not only A
  });
});
