// Shapes shared by the API scripts' declaration files (the scripts are plain .mjs).
export interface League { id: string; openfootball: string; name: string; country: string; teams: number; tiebreak: string[] }
export interface Score { ft: [number, number]; ht: [number, number] | null }
export interface Match {
  id: string; round: string | null; stage: "league" | "playoffs" | "group"; date: string; time: string | null; home: string; away: string;
  status: "finished" | "scheduled"; score: Score | null; source: string; correctionSource?: string; sourceUrl?: string;
}
/** An international tournament played in groups (data/api/tournaments.json). */
export interface Tournament { id: string; name: string; full: string; region: string; season: string; finals: string; wikipedia: string; groups: string[];
  qualify: number; hosts?: string[]; tiebreak: string[] }
/** A tournament game from a group page's match box: kickoff carries the venue's UTC offset. */
export interface GroupMatch extends Match { stage: "group"; group: string; kickoff: string | null }
export interface Season { name: string; teams: Record<string, string>; matches: Match[] }
export interface Adjustment { team: string; points: number; why: string; source: string }
export interface Correction { date: string; home: string; away: string; had: [number, number] | null; ft: [number, number]; source: string }
export interface Row { position: number; team: string; played: number; won: number; drawn: number; lost: number; gf: number; ga: number; gd: number; points: number; adjustment: number }
