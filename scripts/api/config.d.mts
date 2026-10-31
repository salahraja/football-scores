import type { Adjustment, Correction, League } from "./types.d.mts";
export function leagues(): League[];
export function loadAdjustments(season: string, leagueId: string): Adjustment[];
export function loadCorrections(season: string, leagueId: string): Correction[];
