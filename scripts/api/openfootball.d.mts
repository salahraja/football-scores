import type { Correction, Match, Season } from "./types.d.mts";
export function parseSeason(file: unknown, leagueId: string): Season;
export function applyCorrections<M extends Pick<Match, "date" | "home" | "away" | "score">>(matches: M[], corrections: Correction[]): M[];
