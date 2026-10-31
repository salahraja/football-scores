import type { Adjustment, League, Match, Row } from "./types.d.mts";
export function computeTable(matches: Match[], league: Pick<League, "tiebreak">, adjustments?: Adjustment[]): Row[];
