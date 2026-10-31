import type { Match } from "./types.d.mts";

export type GridResult = { home: string; away: string; ft: [number, number] };
export type Disagreement = { match: string; openfootball: [number, number]; wikipedia: [number, number] };
export function parseResults(wikitext: string): GridResult[];
export function applyResults(matches: Match[], results: Array<{ home: string; away: string; ft: number[] }>, teams: Record<string, string>,
  sourceUrl: string, today?: string | null): { matches: Match[]; filled: number; disagreements: Disagreement[] };
