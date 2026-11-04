// openfootball/football.json (public domain, CC0) into our match shape. A season file is { name, matches: [{ round, date, time, team1, team2,
// score }] }, where score is { ft: [h, a], ht?: [h, a] }, a bare [h, a] (full time, no half time), or missing for a game not played yet.
import { shortName, teamId } from "./teams.mjs";

const pair = (v) => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n) && n >= 0) ? [v[0], v[1]] : null;

function readScore(score) {
  if (Array.isArray(score)) return pair(score) ? { ft: pair(score), ht: null } : null;
  if (score && typeof score === "object" && pair(score.ft)) return { ft: pair(score.ft), ht: pair(score.ht) };
  return null;
}

/** { name, teams: { id: name }, matches: [{ id, round, date, time, home, away, status, score }] } for one league season. */
export function parseSeason(file, leagueId) {
  const teams = {};
  const seen = new Map();
  const matches = (file.matches ?? []).map((m) => {
    const home = teamId(m.team1), away = teamId(m.team2);
    teams[home] ??= shortName(m.team1);
    teams[away] ??= shortName(m.team2);
    // A stable id: league, date, the two teams (a replayed or rescheduled game on another day is another match).
    const base = `${leagueId}:${m.date}:${home}-${away}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const score = readScore(m.score);
    // League games carry "Matchday N"; anything else (the Championship's "Playoffs") is played after the table and never counts in it.
    const stage = /^matchday\b/i.test(m.round ?? "") ? "league" : "playoffs";
    return { id: n === 1 ? base : `${base}:${n}`, round: m.round ?? null, stage, date: m.date, time: m.time ?? null, home, away,
      status: score ? "finished" : "scheduled", score, source: "openfootball" };
  });
  return { name: file.name, teams, matches };
}

/** The season's matches with corrections applied. Throws if a correction no longer matches what the source has (it was fixed upstream, or
 *  the game moved), so a stale correction never quietly overrides a good score. */
export function applyCorrections(matches, corrections) {
  const byKey = new Map(corrections.map((c) => [`${c.date}:${c.home}-${c.away}`, c]));
  const used = new Set();
  const out = matches.map((m) => {
    const c = byKey.get(`${m.date}:${m.home}-${m.away}`);
    if (!c) return m;
    const had = m.score?.ft ?? null;
    if (JSON.stringify(had) !== JSON.stringify(c.had)) throw new Error(`correction for ${m.id} expected the source to have ${JSON.stringify(c.had)}, it has ${JSON.stringify(had)}`);
    used.add(c);
    return { ...m, status: "finished", score: { ft: c.ft, ht: null }, source: "correction", correctionSource: c.source };
  });
  const unused = corrections.filter((c) => !used.has(c));
  if (unused.length) throw new Error(`corrections with no matching game: ${unused.map((c) => `${c.date} ${c.home}-${c.away}`).join(", ")}`);
  return out;
}
