import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomeView from "../src/views/HomeView.vue";
import { getStandings } from "../src/data";
import { teamId } from "../src/data/clubid";

// The homepage's Headlines box and Following (Salah, 2026-11-12: "why is the main page not being updated"): the box used to say "a news feed we are
// allowed to show, still to choose". It now shows the newest stories from the site's own news file, can show only the clubs you follow, and a star in a
// table follows a club. The follows are the ones /following/ and the league pages keep (localStorage "golboard.following").
const row = (team: string, position: number) => ({ position, team, played: 9, won: 8, drawn: 0, lost: 1, gf: 14, ga: 5, gd: 9, points: 24, adjustment: 0 });
const story = (n: number, clubs: string[] = []) => ({ title: `Story ${n}`, summary: `About ${n}`, url: `https://news.test/${n}`, source: n % 2 ? "BBC Sport" : "The Guardian",
  published: new Date(Date.UTC(2026, 10, 12, 20, 0) - n * 3_600_000).toISOString(), image: null, clubs });
const NEWS = { generatedAt: "2026-11-12T22:00:00Z", articles: [story(1, ["arsenal"]), story(2), story(3, ["juventus", "arsenal"]), story(4, ["chelsea"]), story(5), story(6), story(7), story(8, ["arsenal"])] };
const game = (id: string, round: string, home: string, away: string) => ({ id, round, stage: "league", home, away, status: "finished", date: "2026-11-02", score: { ft: [1, 0] } });
const replies: Record<string, unknown> = {
  "competitions.json": { competitions: [{ id: "it-1", name: "Serie A", current: "2026-27" }, { id: "en-1", name: "Premier League", current: "2026-27" }] },
  "it-1/2026-27/table.json": { table: [row("juventus", 7)], zones: { zones: [], note: "" } },
  "it-1/2026-27/matches.json": { matches: [] },
  "it-1/2026-27/teams.json": { teams: { juventus: "Juventus" } },
  "en-1/2026-27/table.json": { table: [row("arsenal", 1), row("chelsea", 2)], zones: { zones: [], note: "" } },
  "en-1/2026-27/matches.json": { matches: [game("a", "Matchday 9", "newcastle-united", "arsenal"), game("b", "Matchday 9", "chelsea", "tottenham-hotspur")] },
  "en-1/2026-27/teams.json": { teams: { arsenal: "Arsenal", chelsea: "Chelsea", "newcastle-united": "Newcastle United", "tottenham-hotspur": "Tottenham Hotspur" } },
  "news.json": NEWS,
  // Juventus is named in no general story but one; the Guardian's own Juventus feed has more (Salah, 2026-11-12: "I followed Juve & its showing 0 headlines")
  "news/juventus.json": { generatedAt: "2026-11-12T22:00:00Z", articles: [{ ...story(20, ["juventus"]), title: "Juve club story", published: "2026-11-12T21:00:00.000Z", url: "https://guardian.test/juve" },
    { ...story(21, ["juventus"]), title: "Story 3 again", url: "https://news.test/3?from=guardian", published: story(3).published }] },
};
function stub(fail = "") {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const key = url.replace("/api/v1/", "");
    return key === fail || !(key in replies) ? { ok: false, status: 500 } : { ok: true, status: 200, json: async () => replies[key] };
  }));
}
// Node 24 hides jsdom's localStorage behind its own experimental one (absent without a flag), so the page gets a plain stand-in
const memory = new Map<string, string>();
const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, String(v)), clear: () => memory.clear() };
const saved = () => JSON.parse(memory.get("golboard.following") ?? "[]");
const home = () => mount(HomeView, { global: { stubs: { RouterLink: RouterLinkStub } } });
const titles = (w: ReturnType<typeof home>) => w.findAll('[data-test="headlines"] a.story .t').map((a) => a.text());

beforeEach(() => { Object.defineProperty(window, "localStorage", { value: storage, configurable: true }); memory.clear(); });
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

describe("the homepage's Headlines box", () => {
  it("shows the newest stories from the site's news file, six at most, each linking out to its publisher", async () => {
    stub();
    const w = home();
    await flushPromises();
    expect(titles(w)).toEqual(["Story 1", "Story 2", "Story 3", "Story 4", "Story 5", "Story 6"]);
    const first = w.get('[data-test="headlines"] a.story');
    expect(first.attributes("href")).toBe("https://news.test/1");
    expect(first.attributes("rel")).toBe("noopener");
    expect(first.text()).toContain("BBC Sport");
    expect(w.get('[data-test="headlines"]').text()).not.toMatch(/still to choose/i);
  });

  it("links to every headline and to the clubs page, and says so when the headlines cannot be read", async () => {
    stub("news.json");
    const w = home();
    await flushPromises();
    const links = w.findAll('[data-test="headlines"] a').map((a) => a.attributes("href"));
    expect(links).toEqual(expect.arrayContaining(["/news/", "/following/"]));
    expect(w.get('[data-test="headlines"]').text()).toMatch(/could not be read/i);
  });

  it("shows only the stories about followed clubs when Following is chosen, and remembers the choice", async () => {
    stub();
    memory.set("golboard.following", JSON.stringify(["arsenal"]));
    const w = home();
    await flushPromises();
    await w.get('[data-test="news-following"]').trigger("click");
    expect(titles(w)).toEqual(["Story 1", "Story 3", "Story 8"]);
    expect(memory.get("golboard.newsScope")).toBe("following");
    expect(w.get('[data-test="news-following"]').attributes("aria-pressed")).toBe("true");
    await w.get('[data-test="news-all"]').trigger("click");
    expect(titles(w)).toHaveLength(6);
  });

  it("starts on Following when that was the last choice (the /news/ page keeps the same one)", async () => {
    stub();
    memory.set("golboard.following", JSON.stringify(["chelsea"]));
    memory.set("golboard.newsScope", "following");
    const w = home();
    await flushPromises();
    expect(titles(w)).toEqual(["Story 4"]);
  });

  it("Following also shows the followed club's own stories, newest first, with a story that is in both lists once", async () => {
    stub();
    memory.set("golboard.following", JSON.stringify(["juventus"]));
    memory.set("golboard.newsScope", "following");
    const w = home();
    await flushPromises();
    expect(titles(w)).toEqual(["Juve club story", "Story 3"]);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/v1/news/juventus.json");
  });

  it("a club whose own file cannot be read does not hide the others' stories", async () => {
    stub("news/juventus.json");
    memory.set("golboard.following", JSON.stringify(["juventus", "chelsea"]));
    memory.set("golboard.newsScope", "following");
    const w = home();
    await flushPromises();
    expect(titles(w)).toEqual(["Story 3", "Story 4"]);
  });

  it("says what to do when no club is followed, or none has a story", async () => {
    stub();
    memory.set("golboard.newsScope", "following");
    const w = home();
    await flushPromises();
    expect(w.get('[data-test="headlines"]').text()).toMatch(/star/i);
    memory.set("golboard.following", JSON.stringify(["napoli"]));
    const again = home();
    await flushPromises();
    expect(again.get('[data-test="headlines"]').text()).toMatch(/no headlines mention your clubs/i);
  });
});

describe("following a club from a table", () => {
  const openPremierLeague = async () => {
    const w = home();
    await flushPromises();
    await w.findAll('[data-test="league"]')[1].trigger("click");
    await flushPromises();
    return w;
  };

  it("a star beside each club follows and unfollows it, keeps it on the device, and marks the row", async () => {
    stub();
    const w = await openPremierLeague();
    const star = () => w.get('[data-test="table"] button[data-club="arsenal"]');
    expect(star().attributes("aria-pressed")).toBe("false");
    expect(star().attributes("aria-label")).toBe("Follow Arsenal");
    await star().trigger("click");
    expect(saved()).toEqual(["arsenal"]);
    expect(star().attributes("aria-pressed")).toBe("true");
    expect(star().attributes("aria-label")).toBe("Unfollow Arsenal");
    expect(w.findAll('[data-test="table"] tbody tr').find((r) => r.text().includes("Arsenal"))!.classes()).toContain("mine");
    await star().trigger("click");
    expect(saved()).toEqual([]);
  });

  it("follows at once change what the Headlines box shows", async () => {
    stub();
    memory.set("golboard.newsScope", "following");
    const w = await openPremierLeague();
    expect(titles(w)).toEqual([]);
    await w.get('[data-test="table"] button[data-club="chelsea"]').trigger("click");
    expect(titles(w)).toEqual(["Story 4"]);
  });

  it("the poster opens on a followed club's game, in place of the old fixed favourite", async () => {
    stub();
    let w = await openPremierLeague();
    expect(w.get('[data-test="hero"]').text()).toContain("Newcastle United");   // the first game, nothing followed
    memory.set("golboard.following", JSON.stringify(["tottenham-hotspur"]));
    w = await openPremierLeague();
    expect(w.get('[data-test="hero"]').text()).toContain("Tottenham Hotspur");
    expect(w.get('[data-test="hero"]').text()).toContain("Chelsea");
  });

  it("every row of Serie A's table (football-data's own names for the clubs) has a star, under the site's id for that club", async () => {
    stub();
    const w = home();
    await flushPromises();
    const stars = w.findAll('[data-test="table"] button[data-club]').map((b) => b.attributes("data-club"));
    expect(stars).toEqual(getStandings().map((r) => teamId(r.team.name)));
    expect(stars).toContain("inter");  // "Inter", which the API calls Inter Milan
  });

  it("with no club followed, Juventus is still the marked row (the old favourite), and following a club replaces it", async () => {
    stub();
    let w = home();
    await flushPromises();
    expect(w.findAll('[data-test="table"] tbody tr').find((r) => r.text().includes("Juventus"))!.classes()).toContain("mine");
    memory.set("golboard.following", JSON.stringify(["lazio"]));
    w = home();
    await flushPromises();
    const rows = w.findAll('[data-test="table"] tbody tr');
    expect(rows.find((r) => r.text().includes("Lazio"))!.classes()).toContain("mine");
    expect(rows.find((r) => r.text().includes("Juventus"))!.classes()).not.toContain("mine");
  });
});
