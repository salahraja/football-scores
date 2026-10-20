import type { MatchEvent, StandingRow } from "./types";

// SAMPLE DATA. Illustrative numbers only, not real fixtures or results.
const teams = [
  [1, "Juventus"], [2, "Inter"], [3, "Milan"], [4, "Napoli"], [5, "Roma"],
  [6, "Lazio"], [7, "Atalanta"], [8, "Fiorentina"],
] as const;

const name = (id: number) => teams.find(([i]) => i === id)![1];
const team = (id: number) => ({ id, name: name(id) });

export const sampleStandings: StandingRow[] = [
  { id: 101, position: 0, team: team(2), matches: 10, wins: 7, draws: 2, losses: 1, points: 0 },
  { id: 102, position: 0, team: team(1), matches: 10, wins: 7, draws: 2, losses: 1, points: 0 },
  { id: 103, position: 0, team: team(4), matches: 10, wins: 6, draws: 2, losses: 2, points: 0 },
  { id: 104, position: 0, team: team(3), matches: 10, wins: 5, draws: 4, losses: 1, points: 0 },
  { id: 105, position: 0, team: team(7), matches: 10, wins: 5, draws: 2, losses: 3, points: 0 },
  { id: 106, position: 0, team: team(5), matches: 10, wins: 4, draws: 3, losses: 3, points: 0 },
  { id: 107, position: 0, team: team(6), matches: 10, wins: 3, draws: 3, losses: 4, points: 0 },
  { id: 108, position: 0, team: team(8), matches: 10, wins: 2, draws: 2, losses: 6, points: 0 },
];

const ev = (id: number, h: number, hs: number, a: number, as: number, round: number): MatchEvent => ({
  id,
  homeScore: { current: hs },
  homeTeam: team(h),
  awayScore: { current: as },
  awayTeam: team(a),
  status: { type: "finished" },
  roundInfo: { round },
});

export const sampleResults: MatchEvent[] = [
  ev(201, 1, 2, 3, 1, 10),
  ev(202, 2, 3, 5, 3, 10),
  ev(203, 4, 0, 6, 0, 10),
  ev(204, 7, 1, 8, 2, 10),
];
