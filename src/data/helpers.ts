import type { StandingRow } from "./types";

export const pointsFor = (r: Pick<StandingRow, "wins" | "draws">): number => r.wins * 3 + r.draws;

/** Fill in points and sort by points, then wins, then name. Assigns 1-based positions. Does not mutate input. */
export function buildTable(rows: StandingRow[]): StandingRow[] {
  return rows
    .map((r) => ({ ...r, points: pointsFor(r) }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.team.name.localeCompare(b.team.name))
    .map((r, i) => ({ ...r, position: i + 1 }));
}

export type Outcome = "home" | "away" | "draw";

export function outcome(homeScore: number, awayScore: number): Outcome {
  return homeScore > awayScore ? "home" : homeScore < awayScore ? "away" : "draw";
}

export function groupByRound<T extends { roundInfo: { round: number } }>(events: T[]): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const e of [...events].sort((a, b) => b.roundInfo.round - a.roundInfo.round)) {
    const list = out.get(e.roundInfo.round) ?? [];
    list.push(e);
    out.set(e.roundInfo.round, list);
  }
  return out;
}
