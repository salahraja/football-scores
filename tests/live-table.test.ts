import { describe, expect, it } from "vitest";
import { liveTable, type TableIn } from "../src/data/liveTable";
import type { TodayGame } from "../src/data/live";

// Tables that move with the goals: while a league's games are live, its table shows where each club would stand if the live scores ended now.
const r = (id: string, position: number, points: number, gd = 0, gf = 10): TableIn => ({ id, name: id, position, played: 10, won: 0, drawn: 0, lost: 0, points, gd, gf, ga: gf - gd });
const g = (home: string, away: string, score: [number, number] | null, status: TodayGame["status"] = "live"): TodayGame => ({ home, away, score, status, text: "", time: "" });
const byId = (rows: ReturnType<typeof liveTable>) => Object.fromEntries(rows.map((x) => [x.id, x]));

describe("liveTable", () => {
  const table = [r("arsenal", 1, 25, 12), r("chelsea", 2, 24, 10), r("liverpool", 3, 23, 9), r("everton", 4, 10, -5)];

  it("leaves the table as it is when nothing is live", () => {
    const out = liveTable(table, [g("arsenal", "everton", [0, 3], "finished"), g("chelsea", "liverpool", null, "upcoming")], (n) => n);
    expect(out.map((x) => [x.id, x.position, x.moved, x.live])).toEqual([["arsenal", 1, 0, false], ["chelsea", 2, 0, false], ["liverpool", 3, 0, false], ["everton", 4, 0, false]]);
  });

  it("counts a live win, draw and loss and re-sorts by points, then goal difference, then goals scored", () => {
    const out = byId(liveTable(table, [g("arsenal", "everton", [0, 1]), g("liverpool", "chelsea", [2, 0])], (n) => n));
    expect(out.liverpool).toMatchObject({ position: 1, points: 26, played: 11, won: 1, gd: 11, gf: 12, moved: 2, live: true });
    expect(out.arsenal).toMatchObject({ position: 2, points: 25, played: 11, lost: 1, gd: 11, gf: 10, moved: -1, live: true });
    expect(out.chelsea).toMatchObject({ position: 3, points: 24, moved: -1, live: true });
    expect(out.everton).toMatchObject({ position: 4, points: 13, moved: 0, live: true });
  });

  it("gives a draw a point each", () => {
    const out = byId(liveTable(table, [g("chelsea", "arsenal", [1, 1])], (n) => n));
    expect(out.chelsea).toMatchObject({ position: 2, points: 25, drawn: 1, gd: 10, moved: 0, live: true });
    expect(out.arsenal).toMatchObject({ position: 1, points: 26, drawn: 1, moved: 0, live: true });
    expect(out.liverpool).toMatchObject({ position: 3, live: false });
  });

  it("keeps the official order when clubs are level on everything", () => {
    const flat = [r("a", 1, 20, 0, 5), r("b", 2, 20, 0, 5)];
    expect(liveTable(flat, [g("a", "x", [0, 0]), g("b", "y", [0, 0])], (n) => n).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("matches the live feed's names to the table's clubs through the given id function", () => {
    const out = byId(liveTable(table, [g("Everton FC", "Arsenal FC", [2, 0])], (n) => n.replace(" FC", "").toLowerCase()));
    expect(out.everton).toMatchObject({ points: 13, live: true });
    expect(out.arsenal).toMatchObject({ position: 1, points: 25, lost: 1, live: true, moved: 0 });
  });

  it("ignores a live game with no score yet, and a club the table does not have", () => {
    const out = liveTable(table, [g("arsenal", "everton", null), g("chelsea", "somebody", [5, 0])], (n) => n);
    expect(byId(out).arsenal).toMatchObject({ points: 25, played: 10, live: true, position: 2, moved: -1 });
    expect(byId(out).chelsea).toMatchObject({ points: 27, position: 1, moved: 1 });
    expect(out).toHaveLength(4);
  });

  it("works without goal columns (Serie A's own feed), falling back on points and the official order", () => {
    const bare = [{ id: "a", name: "a", position: 1, played: 9, won: 0, drawn: 0, lost: 0, points: 20 }, { id: "b", name: "b", position: 2, played: 9, won: 0, drawn: 0, lost: 0, points: 19 }];
    expect(liveTable(bare, [g("b", "a", [1, 0])], (n) => n).map((x) => [x.id, x.position, x.moved])).toEqual([["b", 1, 1], ["a", 2, -1]]);
  });
});
