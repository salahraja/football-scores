// @vitest-environment jsdom
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { pages } from "../scripts/api/pages.mjs";
import { clean, closed, finished, locked, progress, qualifiers, score } from "../scripts/api/pickem.mjs";

// "Who makes AFCON 2027" (Salah, 2026-11-15): rank each qualifying group; the top two go to the finals, and a host's group sends the
// host plus the best of the rest. While the groups are played, the page says how many of your picks are in the top two today.
const QUAL = { advance: 2, thirds: 0, thirdsVs: [], table: {} };
const B = { groups: { A: ["morocco", "gabon", "niger", "lesotho"], D: ["south-africa", "guinea", "kenya", "eritrea"] }, rounds: [], format: QUAL, hosts: ["kenya"] };
const NOW = { groups: { A: ["morocco", "gabon"], D: ["kenya", "south-africa"] }, final: false };

describe("qualifying picks", () => {
  it("leaves the host out of the ranking: a host group is done once the best of the rest is picked", () => {
    const p = clean(B, { groups: { D: ["guinea", "kenya", "south-africa", "eritrea"] } });
    expect(p.groups.D).toEqual(["guinea", "south-africa", "eritrea"]);
    expect(finished(B, clean(B, { groups: { D: ["guinea"] } }), "D")).toBe(true);
  });

  it("calls a group done once its top two are picked: third and fourth do not matter here", () => {
    expect(finished(B, clean(B, { groups: { A: ["morocco"] } }), "A")).toBe(false);
    expect(finished(B, clean(B, { groups: { A: ["morocco", "gabon"] } }), "A")).toBe(true);
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

// "Lock" (Salah, 2026-11-15): a group's picks lock once one of its games kicks off after you picked them. The groups were half played
// when the page opened, so a group you have not picked yet stays open; once picked, its next kick-off closes it.
describe("locking picks", () => {
  const K = { ...B, kickoffs: { A: ["2026-09-25T15:00:00Z", "2026-11-20T15:00:00Z", "2026-11-24T15:00:00Z"], D: [] } };
  const at = (iso: string) => Date.parse(iso);
  const picked = { groups: { A: ["morocco", "gabon"] }, at: { A: "2026-11-18T09:00:00Z" } };

  it("keeps a group open until its next game after your pick kicks off, then names that kick-off", () => {
    expect(locked(K, clean(K, picked), "A", at("2026-11-20T14:59:00Z"))).toBeNull();
    expect(locked(K, clean(K, picked), "A", at("2026-11-20T15:00:00Z"))).toBe("2026-11-20T15:00:00Z");
  });

  it("leaves a group you have not picked open, and never locks a bracket with no kick-offs", () => {
    expect(locked(K, clean(K, {}), "A", at("2026-11-30T00:00:00Z"))).toBeNull();
    expect(locked(B, clean(B, picked), "A", at("2026-11-30T00:00:00Z"))).toBeNull();
  });

  it("keeps when each group was picked, and drops it for a group with no picks", () => {
    const p = clean(K, { groups: { A: ["morocco"], D: [] }, at: { A: "2026-11-18T09:00:00Z", D: "2026-11-18T09:00:00Z" } });
    expect(p.at).toEqual({ A: "2026-11-18T09:00:00Z" });
  });
});

// A group whose every game is played is closed to new picks (Salah, 2026-11-15, adding the Nations League with two of League A's four
// groups already over): a pick made after seeing the final table would be a free point. Picks made before it ended stay.
describe("a finished group", () => {
  const F = { ...B, done: { A: true } };
  it("takes no new picks, keeps picks made before, and leaves the progress count", () => {
    expect(closed(F, clean(F, {}), "A")).toBe(true);
    expect(closed(F, clean(F, { groups: { A: ["morocco"] }, at: { A: "2026-11-01T00:00:00Z" } }), "A")).toBe(false);
    expect(closed(F, clean(F, {}), "D")).toBe(false);
    expect(progress(F, clean(F, {}))).toEqual({ done: 0, total: 1 });
  });
});

// ---- the page, from the tournament's groups in the API
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-qual-")); dirs.push(d); return d; };
afterAll(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const row = (team: string, position: number, played: number, status: string | null) => ({ position, team, played, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, adjustment: 0, status });
function site(played = 3, playedA = played) {
  const out = tmp();
  build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), out, seasons: ["2025-26"], now: "2026-10-31T17:00:00Z" });
  const dir = join(out, "api/v1/afcon/2026-27");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "groups.json"), JSON.stringify({ tournament: "afcon", season: "2026-27", hosts: ["kenya"], zones: [], groups: [
    { group: "A", name: "Group A", division: null, table: [row("morocco", 1, playedA, "qualify"), row("gabon", 2, playedA, "qualify"), row("niger", 3, playedA, null), row("lesotho", 4, playedA, null)] },
    { group: "D", name: "Group D", division: null, table: [row("south-africa", 1, played, "qualify"), row("guinea", 2, played, null), row("kenya", 3, played, "host"), row("eritrea", 4, played, null)] } ] }));
  writeFileSync(join(dir, "teams.json"), JSON.stringify({ tournament: "afcon", season: "2026-27", teams: { morocco: "Morocco", gabon: "Gabon", niger: "Niger", lesotho: "Lesotho",
    "south-africa": "South Africa", guinea: "Guinea", kenya: "Kenya", eritrea: "Eritrea" } }));
  const nl = join(out, "api/v1/nations-league/2026-27");
  mkdirSync(nl, { recursive: true });
  writeFileSync(join(nl, "groups.json"), JSON.stringify({ tournament: "nations-league", season: "2026-27", hosts: [], zones: [], groups: [
    { group: "A1", name: "League A, Group 1", division: "A", table: [row("france", 1, played, "qf"), row("belgium", 2, played, "qf"), row("italy", 3, played, null), row("turkey", 4, played, "rel")] },
    { group: "B1", name: "League B, Group 1", division: "B", table: [row("switzerland", 1, played, "promo"), row("slovenia", 2, played, "promo_po"), row("scotland", 3, played, null), row("north-macedonia", 4, played, "rel_po")] },
    { group: "D1", name: "League D, Group 1", division: "D", table: [row("malta", 1, played, null), row("andorra", 2, played, null), row("gibraltar", 3, played, null)] } ] }));
  writeFileSync(join(nl, "teams.json"), JSON.stringify({ tournament: "nations-league", season: "2026-27", teams: { france: "France", belgium: "Belgium", italy: "Italy", turkey: "Turkey",
    switzerland: "Switzerland", slovenia: "Slovenia", scotland: "Scotland", "north-macedonia": "North Macedonia", malta: "Malta", andorra: "Andorra", gibraltar: "Gibraltar" } }));
  const game = (group: string, kickoff: string, home: string, away: string) => ({ id: `afcon:${kickoff}:${home}-${away}`, stage: "group", group, date: kickoff.slice(0, 10), kickoff, home, away, score: null });
  writeFileSync(join(dir, "matches.json"), JSON.stringify({ matches: [game("A", "2026-11-20T15:00:00+00:00", "morocco", "gabon"), game("D", "2026-11-21T18:00:00+02:00", "kenya", "guinea")] }));
  pages({ api: join(out, "api/v1"), out });
  return out;
}
const read = (out: string, path: string) => readFileSync(join(out, path), "utf8");
const out = site();
const PAGE = "leagues/bracket/afcon-2027/index.html";

describe("the qualifying page", () => {
  it("is built from the live groups and linked from Leagues", () => {
    const html = read(out, PAGE);
    expect(html).toContain("<title>AFCON 2027 bracket | golboard</title>");
    expect(html).toMatch(/host/i);
    expect(html).toContain("<h2>Who makes the finals</h2>");
    expect(html).toContain("A group locks when its next game kicks off after you pick.");
    const index = read(out, "leagues/index.html");
    expect(index.indexOf("/leagues/bracket/afcon-2027/")).toBeGreaterThan(0);
    expect(index).not.toContain("/leagues/bracket/afcon-2025/");
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
  afterEach(() => { vi.useRealTimers(); });

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

  it("counts groups, not teams, in its progress line, and marks the rest of a done group out", () => {
    load();
    click($('[data-group="A"] [data-team="morocco"]'));
    click($('[data-group="A"] [data-team="gabon"]'));
    expect($(".foot .note")!.textContent).toBe("1 of 2 groups picked");
    expect($('[data-group="A"] [data-team="niger"]')!.textContent).toContain("Out");
  });

  it("locks a group once its next game kicks off after your picks, and Start over keeps it", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-18T09:00:00Z"));
    load();
    click($('[data-group="A"] [data-team="morocco"]'));
    click($('[data-group="A"] [data-team="gabon"]'));
    expect($('[data-group="A"] h3')!.textContent).not.toMatch(/Locked/);
    vi.setSystemTime(new Date("2026-11-20T15:01:00Z"));
    load();
    expect($('[data-group="A"] h3')!.textContent).toMatch(/Locked/);
    click($('[data-group="A"] [data-team="niger"]'));
    expect($('[data-group="A"] [data-team="niger"]')!.textContent).toContain("Out");
    expect($('[data-group="A"] [data-team="morocco"]')!.textContent).toContain("Through");
    click($('[data-group="D"] [data-team="guinea"]'));   // D's game is later: still open
    expect($('[data-group="D"] [data-team="guinea"]')!.textContent).toContain("Through");
    click($("#start-over"));
    click($("#start-over"));
    expect($('[data-group="A"] [data-team="morocco"]')!.textContent).toContain("Through");
    expect($('[data-group="D"] [data-team="guinea"]')!.textContent).not.toContain("Through");
  });

  it("closes a finished group you never picked: no taps, marked Finished, out of the count", () => {
    load(site(3, 6));
    expect($('[data-group="A"] h3')!.textContent).toMatch(/Finished/);
    click($('[data-group="A"] [data-team="niger"]'));
    expect($('[data-group="A"] [data-team="niger"]')!.textContent).not.toContain("Through");
    expect($(".foot .note")!.textContent).toBe("0 of 1 groups picked");
  });

  it("shows no finalists card when every group is over and you picked none (it read \"Your 0 in the finals\", audit 2026-11-18)", () => {
    load(site(6));
    expect($("#finalists")).toBeNull();
  });

  it("says how you did once every game is played", () => {
    const done = site(6);
    storage.setItem("golboard.pickem.afcon-2027", JSON.stringify({ groups: { A: ["morocco", "gabon"] }, at: { A: "2026-09-01T00:00:00Z" } }));   // picked before the games
    load(done);
    expect($("#score")!.textContent).toContain("You got 2 of 2 right");
  });
});

// "Add UEFA Nations League" (Salah, 2026-11-15), then "That's only League A": every league. A's top two make the quarter-finals; in B and
// C the winner goes up and the runner-up gets a play-off; League D's groups have three teams and the winner goes up, so you pick one.
describe("the Nations League page", () => {
  const NL = "leagues/bracket/nations-league-2027/index.html";
  const data = () => JSON.parse(/<script type="application\/json" id="bracket-data">([\s\S]*?)<\/script>/.exec(read(out, NL))![1]);
  it("has every league's groups, each with how many go up and today's places", () => {
    const html = read(out, NL);
    expect(html).toContain("<h2>Who finishes on top</h2>");
    const d = data();
    expect(Object.keys(d.groups)).toEqual(["A1", "B1", "D1"]);
    expect(d.advance).toEqual({ A1: 2, B1: 2, D1: 1 });
    expect(d.now.groups).toEqual({ A1: ["france", "belgium"], B1: ["switzerland", "slovenia"], D1: ["malta"] });
    expect(d.labels.B1).toBe("League B, Group 1");
    expect(read(out, "leagues/index.html")).toContain("/leagues/bracket/nations-league-2027/");
  });

  it("draws its groups in the browser, under a heading per league, and a League D group is done after one pick", () => {
    memory.clear();
    document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/.exec(read(out, NL))![1];
    (0, eval)(read(out, "leagues/pickem.js"));
    // a heading per league, then short card titles, so a title fits one line on a phone
    expect(document.querySelector('[data-group="B1"] h3')!.firstChild!.textContent).toBe("Group 1");
    expect([...document.querySelectorAll(".league")].map((h) => h.textContent)).toEqual(["League A", "League B", "League D"]);
    const tap = (sel: string) => document.querySelector(sel)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    tap('[data-group="D1"] [data-team="andorra"]');
    expect(document.querySelector('[data-group="D1"] h3')!.textContent).toMatch(/Done/);
    expect(document.querySelector('[data-group="D1"] [data-team="malta"]')!.textContent).toContain("Out");
  });
});
