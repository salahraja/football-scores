export interface Zone { kind: string; from: number; to: number }
export type ZonesFor = (season: string, leagueId: string) => { zones: Zone[]; note: string } | null;
export function pages(opts?: { api?: string; out?: string; zones?: ZonesFor }): { pages: number };
export function liveScript(): string;
export function followScript(): string;
