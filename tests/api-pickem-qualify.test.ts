// @vitest-environment jsdom
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { pages } from "../scripts/api/pages.mjs";
import { clean, finished, qualifiers, score } from "../scripts/api/pickem.mjs";

// "Who makes AFCON 2027" (Salah, 2026-11-15): rank each qualifying group; the top two go to the finals, and a host's group sends the
// host plus the best of the rest. While the groups are played, the page says how many of your picks are in the top two today.
const QUAL = { advance: 2, thirds: 0, thirdsVs: [], table: {} };
const B = { groups: { A: ["morocco", "gabon", "niger", "lesotho"], D: ["south-africa", "guinea", "kenya", "eritrea"] }, rounds: [], format: QUAL, hosts: ["kenya"] };
const NOW = { groups: { A: ["morocco", "gabon"], D: ["kenya", "south-africa"] }, final: false };

describe("qualifying picks", () => {
  it("leaves the host out of the ranking: a host group is done when the other three are ranked", () => {
    const p = clean(B, { groups: { D: ["guinea", "kenya", "south-africa", "eritrea"] } });
    expect(p.groups.D).toEqual(["guinea", "south-africa", "eritrea"]);
    expect(finished(B, p, "D")).toBe(true);
  });

  it("sends the top two of a group, or the host and the best of the rest", () => {
    const p = clean(B, { groups: { A: ["gabon", "morocco", "niger", "lesotho"], D: ["guinea", "south-africa", "eritrea"] } });
    expect(qualifiers(B, p)).toEqual(["gabon", "morocco", "kenya", "guinea"]);
  });

  it("counts the picks that are in the top two today, leaving out the hosts", () => {
    const p = clean(B, { groups: { A: ["gabon", "niger", "morocco", "lesotho"], D: ["guinea", "south-africa", "eritrea"] } });
    expect(score(B, p, NOW)).toEqual({ right: 1, of: 3 });   // gabon yes, niger no, guinea no; Kenya is host, a free pick, so not counted
    expect(score(B, clean(B, {}), NOW)).toEqual({ right: 0, of: 0 });
  });
});

// ---- the page, from the tournament's groups in the API
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-qual-")); dirs.push(d); return d; };
afterAll(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const row = (team: string, position: number, played: number, status: string | null) => ({ position, team, played, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, adjustment: 0, status });
function site(played = 3) {
  const out = tmp();
  build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), out, seasons: ["2025-26"], now: "2026-10-31T17:00:00Z" });
  const dir = join(out, "api/v1/afcon/2026-27");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "groups.json"), JSON.stringify({ tournament: "afcon", season: "2026-27", hosts: ["kenya"], zones: [], groups: [
    { group: "A", name: "Group A", division: null, table: [row("morocco", 1, played, "qualify"), row("gabon", 2, played, "qualify"), row("niger", 3, played, null), row("lesotho", 4, played, null)] },
    { group: "D", name: "Group D", division: null, table: [row("south-africa", 1, played, "qualify"), row("guinea", 2, played, null), row("kenya", 3, played, "host"), row("eritrea", 4, played, null)] } ] }));
  writeFileSync(join(dir, "teams.json"), JSON.stringify({ tournament: "afcon", season: "2026-27", teams: { morocco: "Morocco", gabon: "Gabon", niger: "Niger", lesotho: "Lesotho",
    "south-africa": "South Africa", guinea: "Guinea", kenya: "Kenya", eritrea: "Eritrea" } }));
  pages({ api: join(out, "api/v1"), out });
  return out;
}
const read = (out: string, path: string) => readFileSync(join(out, path), "utf8");
const out = site();
const PAGE = "leagues/bracket/afcon-2027/index.html";

describe("the qualifying page", () => {
  it("is built from the live groups and linked from Leagues before the practice bracket", () => {
    const html = read(out, PAGE);
    expect(html).toContain("<title>AFCON 2027 bracket | golboard</title>");
    expect(html).toMatch(/host/i);
    expect(html).toContain("<h2>Who makes the finals</h2>");
    const index = read(out, "leagues/index.html");
    expect(index.indexOf("/leagues/bracket/afcon-2027/")).toBeGreaterThan(0);
    expect(index.indexOf("/leagues/bracket/afcon-2027/")).toBeLessThan(index.indexOf("/leagues/bracket/afcon-2025/"));
  });

  it("is left out when the tournament's groups are not in the API", () => {
    const bare = tmp();
    build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), out: bare, seasons: ["2025-26"], now: "2026-10-31T17:00:00Z" });
    pages({ api: join(bare, "api/v1"), out: bare });
    expect(read(bare, "leagues/index.html")).not.toContain("/leagues/bracket/afcon-2027/");
  });
});

// ---- the script
const memory = new Map<string, string>();
const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, String(v)), clear: () => memory.clear() };
const SCRIPT = read(out, "leagues/pickem.js");
const bodyOf = (o: string) => /<body[^>]*>([\s\S]*)<\/body>/.exec(read(o, PAGE))![1];
const load = (o = out) => { document.body.innerHTML = bodyOf(o); (0, eval)(SCRIPT); };
const click = (el: Element | null) => { expect(el).not.toBeNull(); el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
const $ = (sel: string) => document.querySelector(sel);

describe("pickem.js on the qualifying page", () => {
  beforeEach(() => { Object.defineProperty(window, "localStorage", { value: storage, configurable: true }); memory.clear(); });

  it("shows the host as through already, not to be tapped, and has no knockout tabs", () => {
    load();
    expect($('[data-group="D"] [data-host="kenya"]')!.textContent).toMatch(/Host/);
    expect($('[data-group="D"] button[data-team="kenya"]')).toBeNull();
    expect($(".tabs")).toBeNull();
  });

  it("marks one more through in a host's group, and lists your finalists when every group is ranked", () => {
    load();
    click($('[data-group="D"] [data-team="guinea"]'));
    expect($('[data-group="D"] [data-team="guinea"]')!.textContent).toContain("Through");
    click($('[data-group="D"] [data-team="south-africa"]'));
    expect($('[data-group="D"] [data-team="south-africa"]')!.textContent).toContain("Out");
    click($('[data-group="A"] [data-team="gabon"]'));
    click($('[data-group="A"] [data-team="niger"]'));
    click($('[data-group="A"] [data-team="morocco"]'));
    expect($("#finalists")!.textContent).toContain("Your 4");
    expect($("#finalists")!.textContent).toContain("Kenya");
    expect($('[data-group="D"] [data-team="south-africa"] .code')!.textContent).toBe("RSA");   // FIFA codes, from nations.json
    expect($("#score")!.textContent).toContain("1 of your 3");
    expect($("#score")!.textContent).toMatch(/today/);
  });

  it("says how you did once every game is played", () => {
    const done = site(6);
    load(done);
    click($('[data-group="A"] [data-team="morocco"]'));
    click($('[data-group="A"] [data-team="gabon"]'));
    expect($("#score")!.textContent).toContain("You got 2 of 2 right");
  });
});
