export type LeaderRow = { rank: number; player: string; club: string; value: number };
export type LeaderList = { asOf: string | null; rows: LeaderRow[] };
export function statsSection(text: string): string;
export function clean(text: string): string;
export function parseLeaders(section: string): { goals: LeaderList | null; cleanSheets: LeaderList | null };
