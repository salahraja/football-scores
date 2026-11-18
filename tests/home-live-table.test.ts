import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomeView from "../src/views/HomeView.vue";

// Tables that move with the goals (Salah, 2026-11-18), on the homepage: a league with a game on shows its table as it stands now.
const row = (team: string, position: number, points: number, gd: number) => ({ position, team, played: 10, won: 7, drawn: 1, lost: 2, gf: 20, ga: 20 - gd, gd, points, adjustment: 0 });
const replies: Record<string, unknown> = {
  "competitions.json": { competitions: [{ id: "it-1", name: "Serie A", current: "2026-27" }, { id: "en-1", name: "Premier League", current: "2026-27" }] },
  "it-1/2026-27/table.json": { table: [], zones: { zones: [], note: "" } },
  "it-1/2026-27/matches.json": { matches: [] },
  "it-1/2026-27/teams.json": { teams: {} },
  "en-1/2026-27/table.json": { table: [row("arsenal", 1, 25, 12), row("chelsea", 2, 24, 10), row("everton", 3, 10, -5)], zones: { zones: [], note: "" } },
  "en-1/2026-27/matches.json": { matches: [] },
  "en-1/2026-27/teams.json": { teams: { arsenal: "Arsenal", chelsea: "Chelsea", everton: "Everton" } },
};
function stub(live: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.startsWith("https://sportscore.com")) {
      return { ok: true, status: 200, json: async () => ({ matches: url.includes("english-premier-league") ? live : [] }) };
    }
    const key = url.replace("/api/v1/", "");
    return key in replies ? { ok: true, status: 200, json: async () => replies[key] } : { ok: false, status: 500 };
  }));
}
const home = () => mount(HomeView, { global: { stubs: { RouterLink: RouterLinkStub } } });
const clubs = (w: ReturnType<typeof home>) => w.findAll("table.mini tbody tr").map((r) => r.find("a.club").text());

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("the homepage's live table", () => {
  it("re-orders a league's table on its live scores, marked live, with arrows on the rows that moved", async () => {
    stub([{ home: "Everton", away: "Arsenal", home_score: 1, away_score: 0, status: "inprogress", status_text: "67'", time: "2026-11-18T15:00:00Z" },
          { home: "Chelsea", away: "Wolves", home_score: 2, away_score: 0, status: "inprogress", status_text: "70'", time: "2026-11-18T15:00:00Z" }]);
    window.history.replaceState(null, "", "/?league=en-1");
    const w = home();
    await flushPromises();
    expect(clubs(w)).toEqual(["Chelsea", "Arsenal", "Everton"]);
    expect(w.get('[data-test="live-table"]').text()).toContain("Live");
    expect(w.findAll('[data-test="moved"]').map((m) => m.attributes("aria-label"))).toEqual(["Up 1 place on today's scores", "Down 1 place on today's scores"]);
    expect(w.findAll("tr.playing")).toHaveLength(3);
  });

  it("shows the table as it is, with no live mark, when nothing is on", async () => {
    stub([{ home: "Everton", away: "Arsenal", home_score: 1, away_score: 0, status: "finished", time: "2026-11-18T12:00:00Z" }]);
    window.history.replaceState(null, "", "/?league=en-1");
    const w = home();
    await flushPromises();
    expect(clubs(w)).toEqual(["Arsenal", "Chelsea", "Everton"]);
    expect(w.find('[data-test="live-table"]').exists()).toBe(false);
    expect(w.findAll('[data-test="moved"]')).toHaveLength(0);
  });
});
