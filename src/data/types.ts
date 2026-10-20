export interface StandingRow {
  id: number;
  position: number;
  team: { id: number; name: string };
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
}

export interface MatchEvent {
  id: number;
  homeScore: { current: number };
  homeTeam: { id: number; name: string };
  awayScore: { current: number };
  awayTeam: { id: number; name: string };
  status: { type: string };
  roundInfo: { round: number };
}
