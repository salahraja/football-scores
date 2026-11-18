import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomeView from "../src/views/HomeView.vue";
import { covered, HIDE_GUARD } from "../src/data/hide";

// Hide scores on the homepage (Salah, 2026-11-14: "spoiler-free mode (scores hidden until tapped, per team)"). The clubs marked are the
// ones the league pages keep (localStorage "golboard.hideScores"); a game shown on any page stays shown for the visit (sessionStorage
// "golboard.shown"). The poster's score, the round's list and the headlines that name the club give way to a Show button.
const row = (team: string, position: number) => ({ position, team, played: 9, won: 8, drawn: 0, lost: 1, gf: 14, ga: 5, gd: 9, points: 24, adjustment: 0 });
const story = (n: number, clubs: string[] = []) => ({ title: `Story ${n}`, summary: `About ${n}`, url: `https://news.test/${n}`, source: "BBC Sport",
  published: new Date(Date.UTC(2026, 10, 12, 20, 0) - n * 3_600_000).toISOString(), image: null, clubs });
const game = (id: string, home: string, away: string, ft: [number, number]) => ({ id, round: "Matchday 9", stage: "league", home, away, status: "finished", date: "2026-11-02", score: { ft } });
const replies: Record<string, unknown> = {
  "competitions.json": { competitions: [{ id: "it-1", name: "Serie A", current: "2026-27" }, { id: "en-1", name: "Premier League", current: "2026-27" }] },
  "it-1/2026-27/table.json": { table: [row("juventus", 7)], zones: { zones: [], note: "" } },
  "it-1/2026-27/matches.json": { matches: [] },
  "it-1/2026-27/teams.json": { teams: { juventus: "Juventus" } },
  "en-1/2026-27/table.json": { table: [row("arsenal", 1), row("chelsea", 2)], zones: { zones: [], note: "" } },
  "en-1/2026-27/matches.json": { matches: [game("a", "newcastle-united", "arsenal", [3, 2]), game("b", "chelsea", "tottenham-hotspur", [1, 0])] },
  "en-1/2026-27/teams.json": { teams: { arsenal: "Arsenal", chelsea: "Chelsea", "newcastle-united": "Newcastle United", "tottenham-hotspur": "Tottenham Hotspur" } },
  "news.json": { generatedAt: "2026-11-12T22:00:00Z", articles: [story(1, ["arsenal"]), story(2), story(3, ["chelsea"])] },
};
function stub() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const key = url.replace("/api/v1/", "");
    return key in replies ? { ok: true, status: 200, json: async () => replies[key] } : { ok: false, status: 500 };
  }));
}
// Node 24 hides jsdom's own stores behind its experimental ones (absent without a flag), so the page gets plain stand-ins
const local = new Map<string, string>(), session = new Map<string, string>();
const store = (m: Map<string, string>) => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), clear: () => m.clear() });
async function premierLeague() {
  window.history.replaceState(null, "", "/?league=en-1");
  stub();
  const w = mount(HomeView, { global: { stubs: { RouterLink: RouterLinkStub } } });
  await flushPromises();
  return w;
}
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: store(local), configurable: true });
  Object.defineProperty(window, "sessionStorage", { value: store(session), configurable: true });
  local.clear();
  session.clear();
});
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

describe("covered: when a game's score gives way to a Show button", () => {
  it("is for a marked club's game that has something to give away and was not shown this visit", () => {
    expect(covered(["arsenal"], [], "newcastle-united", "arsenal", true)).toBe(true);
    expect(covered(["arsenal"], [], "chelsea", "tottenham-hotspur", true)).toBe(false);
    expect(covered(["arsenal"], [], "newcastle-united", "arsenal", false)).toBe(false);  // not played yet: a kick-off time is no secret
    expect(covered(["arsenal"], ["newcastle-united arsenal"], "newcastle-united", "arsenal", true)).toBe(false);
  });
  it("counts a game shown on a league page, which remembers it with its day", () => {
    expect(covered(["arsenal"], ["newcastle-united arsenal 2026-11-02"], "newcastle-united", "arsenal", true)).toBe(false);
    expect(covered(["arsenal"], ["newcastle-united arsenal-women 2026-11-02"], "newcastle-united", "arsenal", true)).toBe(true);
  });
});

describe("the homepage with a club's scores hidden", () => {
  it("shows every score when no club is marked", async () => {
    const w = await premierLeague();
    expect(w.find(".reveal").exists()).toBe(false);
    expect(w.get('[data-test="round"]').text()).toContain("3–2");
    expect(w.get('[data-test="hero"]').text()).toContain("3–2");
  });

  it("covers the marked club's score in the round's list and on the poster, and leaves the other game alone", async () => {
    local.set("golboard.hideScores", '["arsenal"]');
    const w = await premierLeague();
    const rows = w.findAll('[data-test="round"] .match');
    expect(rows[0].text()).not.toContain("3–2");
    expect(rows[0].get("button.reveal").text()).toBe("Show");
    expect(rows[0].get("button.reveal").attributes("aria-label")).toBe("Show the score of Newcastle United against Arsenal");
    expect(rows[1].text()).toContain("1–0");
    const hero = w.get('[data-test="hero"]');
    expect(hero.text()).not.toContain("3–2");
    expect(hero.get('[data-test="show-score"]').text()).toBe("Show score");
    expect(hero.get('[data-test="state"]').text()).toBe("Score hidden");
  });

  it("a tap shows that game on the poster and in the list, and remembers it for the visit", async () => {
    local.set("golboard.hideScores", '["arsenal"]');
    const w = await premierLeague();
    await w.get('[data-test="round"] button.reveal').trigger("click");
    expect(w.get('[data-test="round"]').text()).toContain("3–2");
    expect(w.get('[data-test="hero"]').text()).toContain("3–2");
    expect(w.find('[data-test="show-score"]').exists()).toBe(false);
    expect(JSON.parse(session.get("golboard.shown")!)).toEqual(["newcastle-united arsenal"]);
  });

  it("starts with a game shown that was shown on a league page this visit", async () => {
    local.set("golboard.hideScores", '["arsenal"]');
    session.set("golboard.shown", '["newcastle-united arsenal 2026-11-02"]');
    const w = await premierLeague();
    expect(w.get('[data-test="round"]').text()).toContain("3–2");
  });

  it("covers a headline that names the club, and a tap shows it", async () => {
    local.set("golboard.hideScores", '["arsenal"]');
    const w = await premierLeague();
    const items = w.findAll('[data-test="headlines"] .stories > li');
    expect(items[0].find("a.story").exists()).toBe(false);
    expect(items[0].get("button.reveal").text()).toBe("A headline about a club whose scores you hide. Show");
    expect(items[1].get("a.story").text()).toContain("Story 2");
    await items[0].get("button.reveal").trigger("click");
    expect(w.findAll('[data-test="headlines"] .stories > li')[0].get("a.story").text()).toContain("Story 1");
  });
});

describe("the guard in the page's head", () => {
  // Runs before the page is drawn: a device that hides any club keeps every score out of sight until the homepage has read which.
  const run = () => new Function(HIDE_GUARD)();
  afterEach(() => document.documentElement.classList.remove("hiding"));
  it("marks the page when a club's scores are hidden", () => {
    local.set("golboard.hideScores", '["arsenal"]');
    run();
    expect(document.documentElement.classList.contains("hiding")).toBe(true);
  });
  it("leaves the page alone when none are, or the list cannot be read", () => {
    run();
    local.set("golboard.hideScores", "[]");
    run();
    local.set("golboard.hideScores", "{not json");
    run();
    expect(document.documentElement.classList.contains("hiding")).toBe(false);
  });
});
