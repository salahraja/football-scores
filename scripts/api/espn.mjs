// One match from ESPN's football feeds reduced to our own small summary (Salah's decision, 25 November 2026: use them while golboard has
// no customers; docs/api.md says what that means). Two feeds per match:
//   summary  site.api.espn.com/apis/site/v2/sports/soccer/<code>/summary?event=<id>     teams, score, lineups, goals, cards, substitutions
//   plays    sports.core.api.espn.com/v2/sports/soccer/leagues/<code>/events/<id>/competitions/<id>/plays?limit=1000&page=<n>
//            every event of the match; most carry fieldPositionX/Y: percent of the pitch, the acting team attacking toward x = 100 in
//            both halves, y = 0 its right touchline (checked on 12 matches: penalties at 88.5, 50; goal kicks near x = 3; shots "from the
//            right side of the box" at y about 32)
// We keep who played, the timeline, every shot, and each player's touches counted in 30 zones, never the feeds themselves, and never
// their betting blocks. Node only, no dependencies.

const metres = (edges, length) => edges.map((m) => (m / length) * 100);
/** Zone edges in percent: along the pitch the boxes (16.5 m), halfway, and a third of each half between; across it the boxes' and the
 *  six-yard boxes' sides, so the middle row is the goal's width plus a few metres. 6 x 5 = 30 zones. */
export const ZONES = { x: metres([0, 16.5, 34.5, 52.5, 70.5, 88.5, 105], 105), y: metres([0, 13.84, 24.84, 43.16, 54.16, 68], 68) };
const band = (edges, v) => { let i = 0; while (i < edges.length - 2 && v >= edges[i + 1]) i++; return i; };
const clamp = (v) => Math.min(100, Math.max(0, v));
/** The zone of a position: column (own goal line to the opponent's) times 5 plus row (right touchline to left). */
export const zoneOf = (x, y) => band(ZONES.x, clamp(x)) * 5 + band(ZONES.y, clamp(y));

// Events where the player has the ball. Fouls, offsides, cards, substitutions, kick-offs and the ball going out are not touches.
const ON_BALL = new Set(["Pass", "Cross", "Ball touch", "Throw In", "Tackle", "Clear", "Take On", "Interception", "Aerial", "Save",
  "Keeper Sweeper", "Dispossessed", "Blocked Pass", "Free Kick", "Goal Kick", "Shield ball opp", "Own Goal", "Corner Taken", "Smother",
  "Claim", "Punch", "Ball recovery"]);
const SHOTS = { "Shot On Target": "saved", "Shot Off Target": "off", "Shot Blocked": "blocked", "Shot Hit Woodwork": "post",
  "Penalty - Saved": "saved", "Penalty - Missed": "off" };
// "Goal", "Goal - Header", "Goal - Volley", "Penalty - Scored"; never "Goal Kick"
const outcome = (type) => (/^(Goal($| - )|Penalty - Scored)/.test(type) ? "goal" : SHOTS[type] ?? null);
const idIn = (ref, kind) => ref?.match(new RegExp(`/${kind}/(\\d+)`))?.[1] ?? null;
const round = (v, places) => (typeof v === "number" ? Number(v.toFixed(places)) : null);

/** Our summary of one finished match: `summary` is the summary feed, `pages` the plays feed's pages in order. */
// ESPN's boxscore names for the team stats a game page shows (2026-11-28, the goal: what FotMob and SofaScore show)
const STATS = { possession: "possessionPct", shots: "totalShots", onTarget: "shotsOnTarget", corners: "wonCorners", fouls: "foulsCommitted",
  offsides: "offsides", yellow: "yellowCards", red: "redCards", saves: "saves", passes: "totalPasses", accuratePasses: "accuratePasses", tackles: "totalTackles" };

/** Each side's team stats from a summary's boxscore, as numbers ({ home, away }), or null when ESPN has none. A stat it does not give is null. */
export function teamStats(summary) {
  const teams = summary?.boxscore?.teams ?? [];
  const side = (s) => teams.find((t) => t.homeAway === s);
  if (!side("home")?.statistics?.length || !side("away")?.statistics?.length) return null;
  const read = (t) => Object.fromEntries(Object.entries(STATS).map(([ours, theirs]) => {
    const v = Number(t.statistics.find((x) => x.name === theirs)?.displayValue);
    return [ours, Number.isFinite(v) ? v : null];
  }));
  return { home: read(side("home")), away: read(side("away")) };
}

export function reduceMatch(summary, pages) {
  const comp = summary.header.competitions[0];
  const sideOfTeam = new Map(comp.competitors.map((c) => [String(c.team.id), c.homeAway]));
  const team = (s) => {
    const c = comp.competitors.find((x) => x.homeAway === s);
    const r = summary.rosters?.find((x) => x.homeAway === s);
    return { name: c.team.displayName, score: Number(c.score), formation: r?.formation ?? null };
  };
  const players = (summary.rosters ?? []).flatMap((r) => r.roster.map((p) => ({ id: String(p.athlete.id), name: p.athlete.displayName,
    side: r.homeAway, number: p.jersey ? Number(p.jersey) : null, position: p.position?.abbreviation ?? null, starter: Boolean(p.starter) })));
  const sideOfPlayer = new Map(players.map((p) => [p.id, p.side]));
  const other = { home: "away", away: "home" };
  const KINDS = [[/^Own Goal/, "own-goal"], [/^Penalty - Scored/, "penalty"], [/^Goal($| - )/, "goal"], [/^Yellow Card/, "yellow"],
    [/^Red Card/, "red"], [/^Substitution/, "sub"]];
  const events = [];
  for (const k of summary.keyEvents ?? []) {
    const kind = KINDS.find(([re]) => re.test(k.type?.text ?? ""))?.[1];
    if (!kind) continue;
    const [first, second] = (k.participants ?? []).map((p) => String(p.athlete.id));
    // an own goal is the other side's goal; the player's own side comes from the lineup, which the feed never gets wrong
    const side = kind === "own-goal" ? other[sideOfPlayer.get(first)] : sideOfTeam.get(String(k.team?.id)) ?? sideOfPlayer.get(first);
    events.push({ minute: k.clock?.displayValue ?? "", kind, side, player: first ?? null, other: second ?? null });
  }
  const shots = [], touches = {};
  let positions = false;
  for (const p of pages.flatMap((page) => page.items ?? [])) {
    if (p.valid === false) continue;
    const type = p.type?.text ?? "";
    const player = idIn(p.participants?.[0]?.athlete?.$ref, "athletes");
    const side = sideOfTeam.get(idIn(p.team?.$ref, "teams"));
    const placed = typeof p.fieldPositionX === "number" && typeof p.fieldPositionY === "number";
    if (!placed || !player || !side) continue;
    positions = true;
    const shot = outcome(type);
    if (shot && !p.ownGoal) {
      shots.push({ side, player, minute: p.clock?.displayValue ?? "", x: round(p.fieldPositionX, 1), y: round(p.fieldPositionY, 1),
        xg: round(p.expectedGoals, 3), outcome: shot, body: p.contactType?.text ?? null, penalty: Boolean(p.penaltyKick) });
    }
    if (shot || ON_BALL.has(type)) (touches[player] ??= Array(30).fill(0))[zoneOf(p.fieldPositionX, p.fieldPositionY)] += 1;
  }
  return { espn: String(summary.header.id), kickoff: comp.date, home: team("home"), away: team("away"), players, events, shots, positions, touches,
    stats: teamStats(summary) };
}
