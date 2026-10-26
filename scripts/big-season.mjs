// Writes a synthetic large season for speed and scale checks: node scripts/big-season.mjs <outDir> [factor=100]
// factor 1 = one Serie A season (20 teams, 380 matches, 38 rounds); standings and results are factor times that.
// Names mix accents and case on purpose; the generator is a fixed-seed PRNG so every run is identical.
import { mkdirSync, writeFileSync } from "node:fs";

const [dir, f = "100"] = process.argv.slice(2);
const factor = Number(f);
mkdirSync(dir, { recursive: true });
let s = 12345;
const rnd = (k) => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0), (s >>> 8) % k);
const syll = ["Ro", "ma", "Mi", "lan", "Ná", "po", "li", "Zü", "rich", "Éi", "bar", "Øs", "lo", "Ñu", "Ça", "ta", "ke", "St.", "Pau", "ŁK"];
const name = () => { let n = ""; for (let i = 0, L = 2 + rnd(3); i < L; i++) n += syll[rnd(syll.length)]; return rnd(5) === 0 ? n.toLowerCase() : n; };
const rows = [];
for (let i = 0; i < 20 * factor; i++) {
  const wins = rnd(30), draws = rnd(30 - wins + 1);
  rows.push({ id: i + 1, position: 0, team: { id: i + 1, name: rnd(4) === 0 ? "Club " + rnd(50) : name() }, matches: 38, wins, draws, losses: 38 - wins - draws, points: 0 });
}
writeFileSync(`${dir}/standings.json`, JSON.stringify(rows));
const evs = [];
for (let i = 0; i < 380 * factor; i++) {
  const h = rnd(20 * factor), a = rnd(20 * factor);
  evs.push({ id: i + 1, homeScore: { current: rnd(6) }, homeTeam: { id: h + 1, name: rows[h].team.name }, awayScore: { current: rnd(6) },
    awayTeam: { id: a + 1, name: rows[a].team.name }, status: { type: "finished" }, roundInfo: { round: 1 + rnd(38 * Math.max(1, Math.round(factor / 10))) } });
}
writeFileSync(`${dir}/results.json`, JSON.stringify(evs));
console.log(`wrote ${rows.length} standings rows and ${evs.length} events to ${dir}`);
