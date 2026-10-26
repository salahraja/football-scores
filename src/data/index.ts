import { resultsData, standingsData, type ResultsRound } from "./build";
import { buildTable } from "./helpers";
import { sampleResults, sampleStandings } from "./sample";
import type { MatchEvent, StandingRow } from "./types";

// The only place data enters the app. Swap these for real fetches once a host/API is chosen.
//
// One switch: VITE_DATA=generated reads the static JSON that `npm run data` wrote to ./generated (made by the
// Goose CLI, or by the TS engine when Goose is missing). Without it the app computes everything in TS at load,
// exactly as before. Both paths produce the same bytes (tests/engines.test.ts).
const generated = import.meta.glob("./generated/*.json", { eager: true, import: "default" }) as Record<string, unknown>;
const useGenerated = import.meta.env.VITE_DATA === "generated";

function fromGenerated<T>(name: string): T {
  const v = generated[`./generated/${name}.json`];
  if (v === undefined) throw new Error(`VITE_DATA=generated but src/data/generated/${name}.json is missing: run npm run data`);
  return v as T;
}

export const getStandings = (): StandingRow[] =>
  useGenerated ? fromGenerated<StandingRow[]>("standings") : buildTable(sampleStandings);
export const getResults = (): MatchEvent[] => sampleResults;
/** Results grouped by round, newest round first, each event carrying its outcome. */
export const getResultRounds = (): ResultsRound[] =>
  useGenerated ? fromGenerated<ResultsRound[]>("results") : resultsData(sampleResults);

