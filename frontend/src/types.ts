// Shapes of the backend's JSON (see backend/football/shape.py and app.py).

export type CompetitionCode = "PL" | "PD" | "BL1" | "SA" | "FL1" | "CL";

export interface Competition {
  code: CompetitionCode;
  name: string;
  country: string;
  emblem: string;
}

export interface TeamRef {
  id: number;
  name: string;
  shortName: string;
  crest: string | null;
}

export type Duration = "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";

export interface Score {
  home: number | null;
  away: number | null;
  duration: Duration;
  penalties?: { home: number; away: number };
}

export interface Match {
  id: number;
  competition: { code: CompetitionCode; name: string; emblem: string | null };
  utcDate: string;
  status: string;
  homeTeam: TeamRef;
  awayTeam: TeamRef;
  score: Score;
  minute?: number;
  injuryTime?: number;
}

/** Every object response carries these. */
export interface Meta {
  stale: boolean;
  partial: boolean;
  fetchedAt: string;
  age: number; // seconds
}

export interface TodayResponse extends Meta {
  matches: Match[];
}

export interface MatchesResponse extends Meta {
  matchday: number | null;
  currentMatchday: number | null;
  matches: Match[];
}

export interface Zone {
  label: string;
  from: number;
  to: number;
}

export interface TableRow {
  position: number;
  team: TeamRef;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: string | null;
}

export interface StandingsResponse extends Meta {
  season: { label: string | null; startDate: string | null; endDate: string | null; currentMatchday: number | null };
  table: TableRow[];
  zones: Record<string, Zone>;
}

export type Result = "W" | "D" | "L";

export interface RecentMatch extends Match {
  result: Result;
  shootout?: "W" | "L";
}

export interface TeamResponse extends Meta {
  team: TeamRef & { venue: string | null; founded: number | null };
  nextMatch: Match | null;
  recentMatches: RecentMatch[];
  positions: { competition: CompetitionCode; position: number; points: number }[];
}
