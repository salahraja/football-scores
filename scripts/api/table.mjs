// A league table computed from results, never copied from a source. Order follows the league's own rules (data/api/leagues.json `tiebreak`):
// teams level on everything so far are split by the next rule, and a head-to-head rule looks only at games between the teams still level.

const blank = (team) => ({ team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, adjustment: 0, awayGf: 0 });

/** Rows for these teams from these matches; finished matches only. */
function tally(matches, teams, adjustments = []) {
  const rows = new Map(teams.map((t) => [t, blank(t)]));
  for (const m of matches) {
    if (m.status !== "finished" || m.stage === "playoffs" || !rows.has(m.home) || !rows.has(m.away)) continue;
    const [h, a] = m.score.ft;
    const home = rows.get(m.home), away = rows.get(m.away);
    home.played++; away.played++;
    home.gf += h; home.ga += a; away.gf += a; away.ga += h; away.awayGf += a;
    if (h > a) { home.won++; away.lost++; } else if (h < a) { away.won++; home.lost++; } else { home.drawn++; away.drawn++; }
  }
  for (const adj of adjustments) if (rows.has(adj.team)) rows.get(adj.team).adjustment += adj.points;
  for (const r of rows.values()) {
    r.gd = r.gf - r.ga;
    r.points = 3 * r.won + r.drawn + r.adjustment;
  }
  return rows;
}

const OVERALL = { points: (r) => r.points, gd: (r) => r.gd, gf: (r) => r.gf, wins: (r) => r.won, away_gf: (r) => r.awayGf };
const HEAD_TO_HEAD = { h2h_points: "points", h2h_gd: "gd", h2h_gf: "gf" };

/** Split one group of tied teams by the rules left, in order; returns the teams in table order. */
function order(group, rules, rows, matches) {
  if (group.length < 2 || rules.length === 0) return [...group].sort();  // still level after every rule: alphabetical, and said so in meta
  const [rule, ...rest] = rules;
  let key;
  if (HEAD_TO_HEAD[rule]) {
    const mini = tally(matches, group);  // only the games between these teams; adjustments never count here
    key = (t) => mini.get(t)[HEAD_TO_HEAD[rule]];
  } else if (OVERALL[rule]) {
    key = (t) => OVERALL[rule](rows.get(t));
  } else {
    throw new Error(`unknown tiebreak rule ${rule}`);
  }
  const byValue = new Map();
  for (const t of group) {
    const v = key(t);
    if (!byValue.has(v)) byValue.set(v, []);
    byValue.get(v).push(t);
  }
  return [...byValue.keys()].sort((x, y) => y - x).flatMap((v) => order(byValue.get(v), rest, rows, matches));
}

/** The table: [{ position, team, played, won, drawn, lost, gf, ga, gd, points, adjustment }]. */
export function computeTable(matches, league, adjustments = []) {
  const teams = [...new Set(matches.filter((m) => m.stage !== "playoffs").flatMap((m) => [m.home, m.away]))];
  const rows = tally(matches, teams, adjustments);
  return order(teams, league.tiebreak, rows, matches).map((team, i) => {
    const { awayGf, ...row } = rows.get(team);
    return { position: i + 1, ...row };
  });
}
