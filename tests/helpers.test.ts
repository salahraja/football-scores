import { describe, expect, it } from "vitest";
import { buildTable, groupByRound, outcome, pointsFor } from "../src/data/helpers";
import { sampleResults, sampleStandings } from "../src/data/sample";

describe("pointsFor", () => {
  it("is 3 per win and 1 per draw", () => {
    expect(pointsFor({ wins: 7, draws: 2 })).toBe(23);
    expect(pointsFor({ wins: 0, draws: 0 })).toBe(0);
  });
});

describe("buildTable", () => {
  const table = buildTable(sampleStandings);
  it("sorts by points descending and numbers positions from 1", () => {
    expect(table.map((r) => r.position)).toEqual(table.map((_, i) => i + 1));
    for (let i = 1; i < table.length; i++) expect(table[i - 1].points).toBeGreaterThanOrEqual(table[i].points);
  });
  it("breaks ties by wins then name", () => {
    const mk = (id: number, name: string, w: number, d: number) => ({
      id, position: 0, team: { id, name }, matches: 10, wins: w, draws: d, losses: 10 - w - d, points: 0,
    });
    const t = buildTable([mk(1, "B", 4, 3), mk(2, "A", 4, 3), mk(3, "C", 5, 0)]);
    expect(t.map((r) => r.team.name)).toEqual(["C", "A", "B"]);
  });
  it("does not mutate its input", () => {
    const copy = JSON.stringify(sampleStandings);
    buildTable(sampleStandings);
    expect(JSON.stringify(sampleStandings)).toBe(copy);
  });
});

describe("outcome", () => {
  it("classifies scores", () => {
    expect(outcome(2, 1)).toBe("home");
    expect(outcome(0, 3)).toBe("away");
    expect(outcome(1, 1)).toBe("draw");
  });
});

describe("groupByRound", () => {
  it("groups events, newest round first", () => {
    const g = groupByRound([
      { id: 1, roundInfo: { round: 3 } },
      { id: 2, roundInfo: { round: 5 } },
      { id: 3, roundInfo: { round: 5 } },
    ]);
    expect([...g.keys()]).toEqual([5, 3]);
    expect(g.get(5)?.map((e) => e.id)).toEqual([2, 3]);
  });
  it("handles the sample results", () => {
    expect(groupByRound(sampleResults).size).toBe(1);
  });
});
