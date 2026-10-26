import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTable } from "../src/data/helpers";

// The documented name-collation rule (scripts/gen-collation.mjs) against ICU, which is what localeCompare uses.
const table = JSON.parse(readFileSync("data/collation.json", "utf8")) as { from: number; to: number; weights: number[][] };
const keyOf = (name: string) => {
  const P: number[] = [], S: number[] = [], T: number[] = [];
  for (const ch of name) {
    const cp = ch.codePointAt(0)!;
    const w = cp >= table.from && cp <= table.to ? table.weights[cp - table.from] : [0, 0, 0];
    if (w[0] === 0) { P.push(0x10000 + cp); S.push(0); T.push(0); } else { P.push(w[0]); S.push(w[1]); T.push(w[2]); }
  }
  return [P, S, T];
};
const seq = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return Math.sign(a.length - b.length);
};
const rule = (x: string, y: string) => {
  const a = keyOf(x), b = keyOf(y);
  return seq(a[0], b[0]) || seq(a[1], b[1]) || seq(a[2], b[2]);
};

describe("collation rule", () => {
  const names = ["zeta", "Alpha", "Émile", "émile", "Emile", "ÉMILE", "Zürich", "Zurich", "Östersund", "Ostersund", "Ñuñoa", "St. Pauli", "St Pauli", "AC Milan", "AC-Milan", "Inter10", "Inter9", "Inter 2", "Łódź", "Atlético Madrid"];
  it("orders every pair of the accents/case corpus like localeCompare", () => {
    for (const a of names) for (const b of names) expect([a, b, rule(a, b)]).toEqual([a, b, Math.sign(a.localeCompare(b))]);
  });
  it("puts accents and case where ICU does (lower case first, accent after plain)", () => {
    expect(buildTable(names.slice(0, 6).map((n, i) => ({ id: i, position: 0, team: { id: i, name: n }, matches: 1, wins: 1, draws: 0, losses: 0, points: 0 }))).map((r) => r.team.name))
      .toEqual(["Alpha", "Emile", "émile", "Émile", "ÉMILE", "zeta"]);
  });
  it("the Goose table file holds exactly the JSON table", () => {
    const g = readFileSync("goose/collation_table.goose", "utf8");
    const nums = g.slice(g.indexOf("let COLL: i32[] = [")).match(/\d+/g)!.slice(1).map(Number);
    expect(nums.slice(0, table.weights.length * 3)).toEqual(table.weights.flat());
  });
});
