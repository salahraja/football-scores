import { buildTable, groupByRound, outcome } from "./helpers.ts";
import type { MatchEvent, StandingRow } from "./types";

export interface ResultsRound {
  round: number;
  events: (MatchEvent & { outcome: "home" | "away" | "draw" })[];
}

/** The standings JSON the app shows. The TS reference for goose/footy.goose and python/footy.py. */
export const standingsData = (rows: StandingRow[]): StandingRow[] => buildTable(rows);

/** The results JSON: rounds newest first, each event with its outcome, keys in a fixed order. */
export const resultsData = (events: MatchEvent[]): ResultsRound[] =>
  [...groupByRound(events)].map(([round, es]) => ({
    round,
    events: es.map((e) => ({
      id: e.id,
      homeScore: { current: e.homeScore.current },
      homeTeam: { id: e.homeTeam.id, name: e.homeTeam.name },
      awayScore: { current: e.awayScore.current },
      awayTeam: { id: e.awayTeam.id, name: e.awayTeam.name },
      status: { type: e.status.type },
      roundInfo: { round: e.roundInfo.round },
      outcome: outcome(e.homeScore.current, e.awayScore.current),
    })),
  }));

/** Same bytes the Goose and Python CLIs print (compact JSON and a newline). */
export const serialize = (v: unknown): string => JSON.stringify(v) + "\n";
