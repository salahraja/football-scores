// Shapes shared by the API scripts' declaration files (the scripts are plain .mjs).
export interface League { id: string; openfootball: string; name: string; country: string; teams: number; tiebreak: string[] }
export interface Score { ft: [number, number]; ht: [number, number] | null }
export interface Match {
  id: string; round: string | null; stage: "league" | "playoffs" | "group"; date: string; time: string | null; home: string; away: string;
  status: "finished" | "scheduled"; score: Score | null; source: string; correctionSource?: string; sourceUrl?: string;
}
/** A cup or international tournament (data/api/tournaments.json). */
export interface TournamentPage { title: string; group?: string; name?: string; groups?: "headings"; division?: string; rounds?: "headings" }
export interface Zone { kind: string; label: string; from: number; to: number; division?: string }
export interface Tournament { id: string; name: string; full: string; region: string; teams: "clubs" | "nations"; season: string; finals: string;
  sportscore?: string; clock?: string; tz?: string; note?: string; pages: TournamentPage[]; zones?: Zone[]; hosts?: string[]; tiebreak: string[] }
/** A tournament game from a match box: kickoff carries a UTC offset. name and division are the group's, for the build only. */
export interface GroupMatch extends Match { stage: "group"; group: string; name: string; division: string | null; kickoff: string | null }
export interface Season { name: string; teams: Record<string, string>; matches: Match[] }
export interface Adjustment { team: string; points: number; why: string; source: string }
export interface Correction { date: string; home: string; away: string; had: [number, number] | null; ft: [number, number]; source: string }
export interface Row { position: number; team: string; played: number; won: number; drawn: number; lost: number; gf: number; ga: number; gd: number; points: number; adjustment: number }
