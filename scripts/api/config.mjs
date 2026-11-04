// The leagues we serve (data/api/leagues.json) and the points a league added or took away outside the results (data/api/adjustments.json).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));

export const leagues = () => read("data/api/leagues.json").leagues;

/** [{ team, points, why, source }] for one league season; empty when there were none. */
export const loadAdjustments = (season, leagueId) => read("data/api/adjustments.json")[season]?.[leagueId] ?? [];

/** [{ date, home, away, had, ft, source }]: scores a source had wrong or missing, for one league season. */
export const loadCorrections = (season, leagueId) => read("data/api/corrections.json")[season]?.[leagueId] ?? [];
