import type { Adjustment, Correction, League } from "./types.d.mts";
export function leagues(): League[];
export function loadAdjustments(season: string, leagueId: string): Adjustment[];
export function loadCorrections(season: string, leagueId: string): Correction[];
export function loadZones(season: string, leagueId: string): { zones: { kind: string; from: number; to: number }[]; note: string } | null;
export function zoneNames(): Record<string, string>;
