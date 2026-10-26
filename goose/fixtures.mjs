// Writes fixtures to the directory given as argv[2]:
//   repo-standings.json, repo-ties.json, repo-rounds.json : from the repo's own sample data and tests
//   big-standings.json, big-rounds.json                   : synthetic, size from argv[3] (default 1000000)
import { writeFileSync, mkdirSync } from "node:fs";
import { sampleResults, sampleStandings } from "../src/data/sample.ts";

const dir = process.argv[2];
const n = Number(process.argv[3] ?? 1_000_000);
mkdirSync(dir, { recursive: true });
const w = (f, v) => writeFileSync(`${dir}/${f}`, JSON.stringify(v));

const mk = (id, name, wins, draws) => ({
  id, position: 0, team: { id, name }, matches: 10, wins, draws, losses: 10 - wins - draws, points: 0,
});
w("repo-standings.json", sampleStandings);
w("repo-ties.json", [mk(1, "B", 4, 3), mk(2, "A", 4, 3), mk(3, "C", 5, 0)]); // from tests/helpers.test.ts
w("repo-rounds.json", [
  { id: 1, roundInfo: { round: 3 } }, { id: 2, roundInfo: { round: 5 } }, { id: 3, roundInfo: { round: 5 } },
]);
w("repo-results.json", sampleResults);

// Deterministic PRNG so every run builds the same season.
let s = 12345;
const rnd = (k) => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0), (s >>> 8) % k);
const big = [];
for (let i = 0; i < n; i++) {
  const wins = rnd(30), draws = rnd(30 - wins + 1);
  big.push(mk(i + 1, `Team ${rnd(n / 10 + 1)}`, wins, draws)); // many equal names and ties on purpose
}
w("big-standings.json", big);
const ev = [];
for (let i = 0; i < n; i++) ev.push({ id: i + 1, roundInfo: { round: 1 + rnd(380) } });
w("big-rounds.json", ev);
