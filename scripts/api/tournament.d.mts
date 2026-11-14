import type { GroupMatch, Row, Tournament } from "./types.d.mts";
export function nation(code: string): { id: string; name: string };
export function footballBoxes(text: string): string;
export function parseBoxes(wikitext: string, group: string, today: string): GroupMatch[];
export function groupTables(tournament: Pick<Tournament, "groups" | "qualify" | "hosts" | "tiebreak">, byGroup: Record<string, GroupMatch[]>):
  { group: string; table: (Row & { status: "qualify" | "host" | null })[] }[];
