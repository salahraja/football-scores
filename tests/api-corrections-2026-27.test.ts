// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadCorrections } from "../scripts/api/config.mjs";
import { applyCorrections } from "../scripts/api/openfootball.mjs";

// 25 November 2026: Wikipedia's Serie A results grid said Juventus 0-10 Venezia for the 4-0 of 22 November (ESPN's match page; the
// page's own hat-trick and scorer tables agree with a Juventus win). openfootball has no score for it yet, so the grid's cell reached
// the live table. ESPN's second witness (build.mjs witness) only sees the last three days on Netlify's cache-less build, so the score
// is put right here, from the record, until openfootball has it.
describe("2026-27 corrections", () => {
  it("Juventus 4-0 Venezia, from ESPN's match page", () => {
    const fix = loadCorrections("2026-27", "it-1");
    expect(fix).toContainEqual({ date: "2026-11-23", home: "juventus", away: "venezia", had: null, ft: [4, 0], source: "https://www.espn.com/soccer/match/_/gameId/401875008" });
    const [m] = applyCorrections([{ id: "it-1:2026-11-23:juventus-venezia", date: "2026-11-23", home: "juventus", away: "venezia", status: "scheduled", score: null }], fix);
    expect(m.score.ft).toEqual([4, 0]);
    expect(m.source).toBe("correction");
  });
});
