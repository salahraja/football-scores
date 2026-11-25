import type { MatchDetail } from "./espn.d.mts";
export function lines(): string;
export function shotMap(game: Pick<MatchDetail, "shots">, names: { home: string; away: string }, who: (id: string) => string): string;
export function zoneMap(counts: number[], label: string, id: string): string;
export function gameBody(game: Omit<MatchDetail, "home" | "away" | "espn">, names: { home: string; away: string }): string;
export const GAME_CSS: string;
