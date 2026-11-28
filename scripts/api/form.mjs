// A club's form and two clubs' previous meetings, from our own results (the goal, Salah 2026-11-28: features that match the big apps,
// which all show both). League games only: a cup tie or a play-off is a different kind of game.

const played = (g) => g.stage === "league" && g.score?.ft;
const newestFirst = (a, b) => b.date.localeCompare(a.date);

/** The club's last `n` league results, newest first: { date, opponent, home, for, against, result: "w" | "d" | "l", match }. */
export function formOf(matches, team, n = 5) {
  return matches.filter((g) => played(g) && (g.home === team || g.away === team)).sort(newestFirst).slice(0, n).map((g) => {
    const home = g.home === team, [h, a] = g.score.ft, us = home ? h : a, them = home ? a : h;
    return { date: g.date, opponent: home ? g.away : g.home, home, for: us, against: them, result: us > them ? "w" : us < them ? "l" : "d", match: g };
  });
}

/** Every finished league game between `a` and `b` (either way round) before `before` (a date), across the given seasons' match lists, newest first. */
export function meetings(seasons, a, b, before) {
  return seasons.flat().filter((g) => played(g) && g.date < before && ((g.home === a && g.away === b) || (g.home === b && g.away === a))).sort(newestFirst);
}
