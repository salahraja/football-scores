import { afterEach, describe, expect, it, vi } from "vitest";
import { today } from "../src/data/live";

// Salah, 2026-11-25: "Do we have live scores by the minute now?" The league pages showed the minute ("Live · 67'") from SportScore's
// match detail; Home showed only the half ("Live · 2nd half"). Home now asks for the same detail for each live game.
const fixtures = (matches: unknown[]) => ({ ok: true, json: async () => ({ matches }) });
const live = { home: "Juventus", away: "Napoli", home_score: 1, away_score: 0, status: "inprogress", status_text: "2nd half", time: "2026-11-25T19:45:00Z",
  url: "/football/match/juventus-vs-napoli/abc123/" };
const done = { ...live, home: "Inter", away: "Roma", status: "finished", url: "/football/match/inter-vs-roma/def456/" };

describe("Home's live games carry the minute", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("a live game reads 'Live · 67'', asking the match detail once per live game and never for a finished one", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      if (url.includes("/fixtures/")) return fixtures([live, done]);
      return { ok: true, json: async () => ({ match: { live_minute: 67 } }) };
    });
    const games = await today("it-1", "2026-11-25");
    expect(games.find((g) => g.home === "Juventus")!.text).toBe("Live · 67'");
    expect(games.find((g) => g.home === "Inter")!.text).toBe("Full time");
    expect(asked.filter((u) => u.includes("/match/"))).toEqual(["https://sportscore.com/api/v1/match/?sport=football&slug=juventus-vs-napoli-abc123"]);
  });

  it("without the detail it keeps the half, as before", async () => {
    vi.stubGlobal("fetch", async (url: string) => (url.includes("/fixtures/") ? fixtures([live]) : { ok: false, json: async () => ({}) }));
    expect((await today("it-1", "2026-11-25"))[0].text).toBe("Live · 2nd half");
  });
});
