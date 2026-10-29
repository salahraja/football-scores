// Writes the committed parity fixtures to tests/fixtures/ (deterministic). Each <name>.standings.json or
// <name>.results.json is fed to the TS reference and to every other engine; the output must match byte for byte.
//   node scripts/make-fixtures.mjs
// "outside-latin" is NOT compared with TS: it holds characters outside the collation table, where the
// documented rule (code point order after Latin) knowingly differs from ICU. Engines are compared with each other.
import { mkdirSync, writeFileSync } from "node:fs";
import { sampleResults, sampleStandings } from "../src/data/sample.ts";

const dir = "tests/fixtures";
mkdirSync(dir, { recursive: true });
const w = (f, v) => writeFileSync(`${dir}/${f}`, JSON.stringify(v, null, 1) + "\n");

const row = (id, name, wins, draws, matches = 10) => ({
  id, position: 0, team: { id, name }, matches, wins, draws, losses: matches - wins - draws, points: 0,
});
const ev = (id, h, hs, a, as, round, status = "finished") => ({
  id, homeScore: { current: hs }, homeTeam: { id: h[0], name: h[1] }, awayScore: { current: as },
  awayTeam: { id: a[0], name: a[1] }, status: { type: status }, roundInfo: { round },
});

w("sample.standings.json", sampleStandings);
w("sample.results.json", sampleResults);
w("empty.standings.json", []);
w("empty.results.json", []);
w("single.standings.json", [row(1, "Juventus", 3, 1)]);
w("ties.standings.json", [row(1, "B", 4, 3), row(2, "A", 4, 3), row(3, "C", 5, 0)]); // tests/helpers.test.ts
// equal points: 3 wins+0 draws = 9 = 2 wins + 3 draws, so wins break it before the name
w("points-then-wins.standings.json", [row(1, "Zed", 2, 3), row(2, "Amy", 3, 0), row(3, "Bob", 3, 0), row(4, "Cat", 0, 9)]);
w("duplicate-names.standings.json", [row(5, "Same", 1, 1), row(3, "Same", 1, 1), row(9, "Same", 1, 1), row(1, "Same", 2, 0)]);
w("negative-and-zero.standings.json", [row(1, "A", 0, 0, 0), row(2, "B", 0, 0, 0), row(3, "C", -1, 0, 0)]);

// Accents and case: the localeCompare vs byte-compare difference found by the spike.
const names = [
  "zeta", "Alpha", "Émile", "émile", "Emile", "ÉMILE", "e", "E", "Eb", "éb", "alpha", "ALPHA", "Ålesund", "Aalborg",
  "Zürich", "Zurich", "zurich", "Östersund", "Ostersund", "Ñuñoa", "Nunoa", "Łódź", "Lodz", "Đồng", "Dong", "İstanbul",
  "Istanbul", "Çankaya", "Cankaya", "Atlético Madrid", "Atletico Madrid", "Atlético  Madrid", "AC Milan", "A.C. Milan",
  "AC-Milan", "ac_milan", "Inter 1908", "Inter 2", "Inter10", "Inter9", "Man City", "man city", "Man. City", "(Loan)",
  "'Sampdoria'", "St. Pauli", "St Pauli", "Saint-Étienne", "Saint Etienne", "Спартак", "Ελλάς", "Zeta", "ze", "Z", "z", "",
  " leading space", "Œuvre".replace("Œ", "Oe"), "Ÿ", "ÿ", "Y", "y",
];
w("accents-case.standings.json", names.map((n, i) => row(i + 1, n, 3, 1)));
// Same, but through the points/wins tiers: pairs of names tie on both.
w("accents-case-mixed.standings.json", names.map((n, i) => row(i + 1, n, 2 + (i % 3), i % 2)));

// JSON string escapes survive the round trip.
const nasty = ['Say "hi"', "back\\slash", "tab\there", "new\nline", "ctl\u0001\u001f", "slash/solidus", "line sep",
  "del\u007f", "emoji \u{1F600}", "astral \u{1D11E}", "quote'single", "<b>&amp;</b>"];
w("escapes.standings.json", nasty.map((n, i) => row(i + 1, n, 1, 0)));
w("escapes.results.json", [ev(1, [1, nasty[0]], 1, [2, nasty[3]], 1, 1, nasty[4]), ev(2, [3, nasty[8]], 0, [4, nasty[9]], 2, 1, "x\"y")]);

// Outside the collation table: engines must agree with each other, not with ICU.
w("outside-latin.standings.json", ["Zagreb", "Ωmega", "Спартак", "日本", "\u{1F600}", "Ünal", "ß-test", "Æsir", "Strasse", "½ price", "ǅ", "ﬁnal", "ƀ", "e\u0301 (decomposed)"].map((n, i) => row(i + 1, n, 1, 0)));

// Results: several rounds, input order inside a round must be kept, rounds newest first.
w("rounds.results.json", [
  ev(1, [1, "Juventus"], 2, [3, "Milan"], 1, 3), ev(2, [2, "Inter"], 0, [5, "Roma"], 0, 5), ev(3, [4, "Napoli"], 1, [6, "Lazio"], 4, 5),
  ev(4, [7, "Atalanta"], 1, [8, "Fiorentina"], 2, 1), ev(5, [1, "Juventus"], 0, [2, "Inter"], 0, 5, "postponed"), ev(6, [3, "Milan"], 5, [4, "Napoli"], 4, 38),
  ev(7, [5, "Roma"], 0, [6, "Lazio"], 1, 3), ev(8, [7, "Atalanta"], 9, [8, "Fiorentina"], 0, 0),
]);

console.log(`wrote fixtures to ${dir}`);
