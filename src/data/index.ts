import { buildTable } from "./helpers";
import { sampleResults, sampleStandings } from "./sample";
import type { MatchEvent, StandingRow } from "./types";

// The only place data enters the app. Swap these for real fetches once a host/API is chosen.
export const getStandings = (): StandingRow[] => buildTable(sampleStandings);
export const getResults = (): MatchEvent[] => sampleResults;
