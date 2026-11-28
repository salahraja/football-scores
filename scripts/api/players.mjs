// Each player's season, added up from the game files we publish (ESPN's detail; the goal, Salah 2026-11-28: FotMob and SofaScore give every
// player a season page). It covers the games ESPN has detail for, and the pages say how many.

const clock = (m) => { const [base, extra] = String(m ?? "").replace(/'/g, "").split("+"); return (Number(base) || 0) + (Number(extra) || 0); };
const FULL = 90;

/** Minutes a player was on the pitch in one game: from kick-off (a starter) or the minute they came on, to the minute they went off, were
 *  sent off, or 90. 0 for a substitute who never came on. Added time in the half they left counts ("45'+2'" is 47). */
export function minutesPlayed(game, id) {
  const p = game.players.find((x) => x.id === id);
  const on = game.events.find((e) => e.kind === "sub" && e.player === id);
  if (!p?.starter && !on) return 0;
  const start = p?.starter ? 0 : clock(on.minute);
  const off = game.events.find((e) => (e.kind === "sub" && e.other === id) || (e.kind === "red" && e.player === id));
  return Math.max(0, (off ? clock(off.minute) : FULL) - start);
}

/** Every player who played in the given games ({ name: game } in file order), keyed by ESPN's id: { name, team, position, number, apps,
 *  starts, minutes, goals, penalties, assists, shots, onTarget, xg, noXg, touches, zones (30), games: [...] newest first }. */
export function seasonByPlayer(files, matches, teams) {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const out = {};
  for (const [name, g] of [...files].sort((a, b) => a[0].localeCompare(b[0]))) {
    const m = byId.get(g.match);
    if (!m?.score) continue;
    const title = `${teams[m.home]} ${m.score.ft[0]}–${m.score.ft[1]} ${teams[m.away]}`;
    for (const p of g.players) {
      const minutes = minutesPlayed(g, p.id);
      if (!minutes && !g.events.some((e) => e.kind === "sub" && e.player === p.id)) continue;
      const s = (out[p.id] ??= { name: p.name, team: null, position: p.position ?? null, number: p.number ?? null, apps: 0, starts: 0, minutes: 0, goals: 0,
        penalties: 0, assists: 0, shots: 0, onTarget: 0, xg: 0, noXg: 0, touches: 0, zones: Array(30).fill(0), games: [] });
      const shots = g.shots.filter((x) => x.player === p.id);
      const scored = g.events.filter((e) => (e.kind === "goal" || e.kind === "penalty") && e.player === p.id);
      const assists = g.events.filter((e) => e.kind === "goal" && e.other === p.id).length;
      const touches = (g.touches[p.id] ?? []).reduce((a, b) => a + b, 0);
      const xg = shots.reduce((a, x) => a + (x.xg ?? 0), 0);
      Object.assign(s, { name: p.name, team: p.side === "home" ? m.home : m.away, position: p.position ?? s.position, number: p.number ?? s.number });
      s.apps += 1; s.starts += p.starter ? 1 : 0; s.minutes += minutes; s.goals += scored.length; s.penalties += scored.filter((e) => e.kind === "penalty").length;
      s.assists += assists; s.shots += shots.length; s.onTarget += shots.filter((x) => x.outcome === "goal" || x.outcome === "saved").length;
      s.xg += xg; s.noXg += shots.filter((x) => x.xg === null).length; s.touches += touches;
      (g.touches[p.id] ?? []).forEach((n, i) => { s.zones[i] += n; });
      s.games.unshift({ game: name, date: m.date, title, minutes, goals: scored.length, assists, shots: shots.length, xg: Math.round(xg * 100) / 100, touches });
    }
  }
  for (const s of Object.values(out)) s.xg = Math.round(s.xg * 100) / 100;
  return out;
}
