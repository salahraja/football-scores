import type { GroupMatch, Row, Tournament, TournamentPage } from "./types.d.mts";
export function nation(code: string): { id: string; name: string };
export function matchText(text: string): string;
export function pageGames(wikitext: string, page: TournamentPage, tournament: Pick<Tournament, "id" | "tz">, today: string):
  { games: GroupMatch[]; names: Record<string, string>; countries: Record<string, string | null> };
export function groupTables(tournament: Pick<Tournament, "zones" | "hosts" | "tiebreak">, games: GroupMatch[]):
  { group: string; name: string; division: string | null; table: (Row & { status: string | null })[] }[];
