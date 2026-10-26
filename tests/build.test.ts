import { describe, expect, it } from "vitest";
import { resultsData, serialize, standingsData } from "../src/data/build";
import { sampleResults, sampleStandings } from "../src/data/sample";

describe("standingsData", () => {
  it("is the sorted table with points and positions", () => {
    const t = standingsData(sampleStandings);
    expect(t.map((r) => r.team.name)).toEqual(["Inter", "Juventus", "Napoli", "Milan", "Atalanta", "Roma", "Lazio", "Fiorentina"]);
    expect(t[0]).toEqual({ id: 101, position: 1, team: { id: 2, name: "Inter" }, matches: 10, wins: 7, draws: 2, losses: 1, points: 23 });
  });
});

describe("resultsData", () => {
  it("groups by round, newest first, with each outcome", () => {
    const r = resultsData(sampleResults);
    expect(r).toHaveLength(1);
    expect(r[0].round).toBe(10);
    expect(r[0].events.map((e) => e.outcome)).toEqual(["home", "draw", "draw", "away"]);
  });
  it("keeps input order inside a round", () => {
    const mk = (id: number, round: number) => ({ ...sampleResults[0], id, roundInfo: { round } });
    const r = resultsData([mk(1, 3), mk(2, 5), mk(3, 5)]);
    expect(r.map((x) => x.round)).toEqual([5, 3]);
    expect(r[0].events.map((e) => e.id)).toEqual([2, 3]);
  });
});

describe("serialize", () => {
  it("is compact JSON plus a newline", () => {
    expect(serialize({ a: [1, 2] })).toBe('{"a":[1,2]}\n');
  });
});
