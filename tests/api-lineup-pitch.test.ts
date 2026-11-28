// @vitest-environment node
import { describe, expect, it } from "vitest";
import { lineupRows, lineupPitch } from "../scripts/api/lineup.mjs";

// The goal (Salah, 2026-11-28): FotMob, SofaScore and OneFootball draw both lineups on a pitch in their formation. ESPN gives each starter a
// position ("CD-L", "LB", "AM-R", "F") and each side a formation ("4-3-3"), so the rows come from the formation, the order from the position.
const P = (id: string, position: string, number: number, side: "home" | "away" = "home") => ({ id, name: `Player ${id}`, side, number, position, starter: true });
const cagliari = [P("1", "G", 1), P("2", "CD-L", 15), P("3", "CD-R", 22), P("4", "LB", 36), P("5", "RB", 2), P("6", "CM", 4), P("7", "LM", 14), P("8", "RM", 8), P("9", "F", 31), P("10", "LF", 70), P("11", "RF", 19)];

describe("lineup rows", () => {
  it("put the goalkeeper first, then the formation's lines from the back, each from the team's left to its right", () => {
    const rows = lineupRows(cagliari, "4-3-3");
    expect(rows!.map((r) => r.map((p) => p.position))).toEqual([["G"], ["LB", "CD-L", "CD-R", "RB"], ["LM", "CM", "RM"], ["LF", "F", "RF"]]);
  });

  it("fill a four-line formation in order of depth", () => {
    const frosinone = [P("1", "G", 1), P("2", "CD-L", 6), P("3", "CD-R", 5), P("4", "LB", 3), P("5", "RB", 2), P("6", "AM", 10), P("7", "LM", 4), P("8", "RM", 8), P("9", "F", 9), P("10", "AM-L", 11), P("11", "AM-R", 7)];
    expect(lineupRows(frosinone, "4-2-3-1")!.map((r) => r.length)).toEqual([1, 4, 2, 3, 1]);
    expect(lineupRows(frosinone, "4-2-3-1")!.at(-1)![0].position).toBe("F");
  });

  it("are null when the formation does not add up to the ten outfield starters", () => {
    expect(lineupRows(cagliari.slice(0, 10), "4-3-3")).toBeNull();
    expect(lineupRows(cagliari, null)).toBeNull();
  });
});

describe("the lineup pitch", () => {
  const away = cagliari.map((p) => ({ ...p, id: `a${p.id}`, side: "away" as const, name: `Away ${p.id}` }));
  const game = { home: { formation: "4-3-3" }, away: { formation: "4-3-3" }, players: [...cagliari, ...away] };
  const svg = lineupPitch(game, { home: "Cagliari", away: "Frosinone" });

  it("draws both sides on one pitch, a shirt number and a name for each of the 22 starters, said in words", () => {
    expect(svg).toMatch(/^<svg class="pitch lineup"/);
    expect((svg.match(/<g class="man (home|away)"/g) ?? []).length).toBe(22);
    expect(svg).toMatch(/<title[^>]*>Cagliari 4-3-3 against Frosinone 4-3-3<\/title>/);
    expect(svg).toContain("<title>Player 9, 31, F</title>");  // the full name on hover and for a screen reader
    expect(svg).toMatch(/<text class="nm" y="5.6">9<\/text>/);  // the surname under the shirt
  });

  it("puts the home side on the left half, attacking right, and the away side on the right half", () => {
    const xs = (side: string) => [...svg.matchAll(new RegExp(`<g class="man ${side}" transform="translate\\(([\\d.]+)`, "g"))].map((m) => Number(m[1]));
    expect(Math.max(...xs("home"))).toBeLessThan(52.5);
    expect(Math.min(...xs("away"))).toBeGreaterThan(52.5);
  });

  it("is empty when either side cannot be drawn", () => {
    expect(lineupPitch({ ...game, away: { formation: null } }, { home: "A", away: "B" })).toBe("");
  });
});

describe("on a game page", async () => {
  const { gameBody: typed } = await import("../scripts/api/gamepage.mjs");
  const gameBody = typed as unknown as (g: unknown, n: { home: string; away: string }) => string;
  const home = cagliari, away = cagliari.map((p) => ({ ...p, id: `a${p.id}`, side: "away" as const }));
  const bench = [{ id: "s1", name: "Sub One", side: "home" as const, number: 99, position: "SUB", starter: false }, { id: "s2", name: "Sub Two", side: "home" as const, number: 98, position: "SUB", starter: false }];
  const game = { home: { formation: "4-3-3" }, away: { formation: "4-3-3" }, players: [...home, ...away, ...bench],
    events: [{ minute: "70'", kind: "sub", side: "home", player: "s1", other: "9" }], shots: [], touches: {}, positions: false, stats: null };

  it("comes first, then the timeline, with each bench and who came on", () => {
    const html = gameBody(game, { home: "Cagliari", away: "Frosinone" });
    expect(html.indexOf("<h2>Lineups</h2>")).toBeGreaterThan(-1);
    expect(html.indexOf("<h2>Lineups</h2>")).toBeLessThan(html.indexOf("<h2>Timeline</h2>"));
    expect(html).toContain("<b>Cagliari bench:</b> 99 Sub One ↑, 98 Sub Two (↑ came on)");
  });

  it("is left out when ESPN's positions do not fit the formation", () => {
    expect(gameBody({ ...game, home: { formation: "5-4-1-1" } }, { home: "A", away: "B" })).not.toContain("<h2>Lineups</h2>");
  });
});
