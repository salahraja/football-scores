import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { leagues, loadAdjustments, loadCorrections } from "../scripts/api/config.mjs";
import { applyCorrections, parseSeason } from "../scripts/api/openfootball.mjs";
import { teamId } from "../scripts/api/teams.mjs";
import { computeTable } from "../scripts/api/table.mjs";

// golboard's own API (Salah, 2026-10-30): tables are computed from match results, never copied. The proof is outside us: every league's
// 2025-26 final table, computed from openfootball's public-domain results, must equal the official final table (Wikipedia, revision saved
// in tests/fixtures/official), order, games, goals and points.
const fixture = (kind: string, code: string) => JSON.parse(readFileSync(`tests/fixtures/${kind}/2025-26/${code}.json`, "utf8"));

describe("our own tables equal the official 2025-26 final tables", () => {
  for (const league of leagues()) {
    it(`${league.name}`, () => {
      const season = parseSeason(fixture("openfootball", league.openfootball), league.id);
      const matches = applyCorrections(season.matches, loadCorrections("2025-26", league.id));
      const ours = computeTable(matches, league, loadAdjustments("2025-26", league.id));
      const official = fixture("official", league.openfootball).table;
      expect(ours.map((r) => r.team)).toEqual(official.map((r: { team: string }) => teamId(r.team)));
      for (const [i, row] of official.entries()) {
        const mine = ours[i];
        expect([mine.played, mine.won, mine.drawn, mine.lost, mine.gf, mine.ga, mine.points], `${league.name} ${row.team}`).toEqual(
          [row.p, row.w, row.d, row.l, row.gf, row.ga, row.pts],
        );
      }
    });
  }
});

describe("every league game's score equals the official result", () => {
  for (const league of leagues()) {
    it(`${league.name}: all of them, after our corrections`, () => {
      const season = parseSeason(fixture("openfootball", league.openfootball), league.id);
      const matches = applyCorrections(season.matches, loadCorrections("2025-26", league.id)).filter((m: { stage: string }) => m.stage === "league");
      const official = JSON.parse(readFileSync(`tests/fixtures/official/2025-26/${league.openfootball}.results.json`, "utf8")).matches;
      const ours = new Map(matches.map((m: { home: string; away: string; score: { ft: number[] } | null }) => [`${m.home}|${m.away}`, m.score?.ft ?? null]));
      expect(ours.size).toBe(official.length);
      const wrong = official.filter((g: { home: string; away: string; ft: number[] }) =>
        JSON.stringify(ours.get(`${teamId(g.home)}|${teamId(g.away)}`)) !== JSON.stringify(g.ft));
      expect(wrong).toEqual([]);
    });
  }
});

describe("a stale correction is refused, never applied quietly", () => {
  it("throws when the source no longer has what the correction expected", () => {
    const m = { id: "x", date: "2026-05-16", home: "a", away: "b", stage: "league", status: "finished", score: { ft: [1, 1], ht: null } };
    expect(() => applyCorrections([m], [{ date: "2026-05-16", home: "a", away: "b", had: [2, 1], ft: [1, 1], source: "s" }])).toThrow(/expected/);
    expect(() => applyCorrections([m], [{ date: "2026-05-17", home: "a", away: "b", had: null, ft: [0, 0], source: "s" }])).toThrow(/no matching game/);
  });
});

describe("one team, one id, whatever the source calls it", () => {
  it("reads the club words off and keeps the name", () => {
    expect(teamId("SSC Napoli")).toBe("napoli");
    expect(teamId("Napoli")).toBe("napoli");
    expect(teamId("FC Internazionale Milano")).toBe(teamId("Inter Milan"));
    expect(teamId("Manchester United FC")).toBe(teamId("Manchester United"));
    expect(teamId("Manchester City FC")).not.toBe(teamId("Manchester United FC"));
    expect(teamId("1. FC Köln")).toBe(teamId("FC Köln"));
  });
});

describe("a match is a result only when it has a full-time score", () => {
  it("reads both openfootball score shapes and leaves unplayed games as fixtures", () => {
    const season = parseSeason({ name: "Test League 2025/26", matches: [
      { round: "Matchday 1", date: "2025-08-23", time: "18:30", team1: "Genoa CFC", team2: "US Lecce", score: [0, 0] },
      { round: "Matchday 1", date: "2025-08-23", time: "20:45", team1: "US Sassuolo Calcio", team2: "SSC Napoli", score: { ft: [0, 2], ht: [0, 1] } },
      { round: "Matchday 2", date: "2025-08-30", time: "18:30", team1: "SSC Napoli", team2: "Genoa CFC" },
    ] }, "it-1");
    expect(season.matches.map((m: { status: string }) => m.status)).toEqual(["finished", "finished", "scheduled"]);
    expect(season.matches[1]).toMatchObject({ home: "sassuolo", away: "napoli", score: { ft: [0, 2], ht: [0, 1] } });
    expect(season.matches[0].score).toEqual({ ft: [0, 0], ht: null });
    expect(season.matches[2].score).toBeNull();
    expect(new Set(season.matches.map((m: { id: string }) => m.id)).size).toBe(3);
  });
});
