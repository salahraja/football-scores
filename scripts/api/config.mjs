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

/** What each table position leads to in one league season ({ zones: [{ kind, from, to }], note }), or null (data/api/zones.json). */
export const loadZones = (season, leagueId) => read("data/api/zones.json").seasons[season]?.[leagueId] ?? null;

/** The zone kinds' names ({ cl: "Champions League", ... }). */
export const zoneNames = () => read("data/api/zones.json").kinds;

/** The site's public address, for canonical links, the sitemap and structured data (SITE_URL overrides it). */
export const SITE = (process.env.SITE_URL ?? "https://football-scores-salah.netlify.app").replace(/\/$/, "");

/** Match ids put off or suspended in one league season (data/api/postponed.json): not counted as late results. */
export const loadPostponed = (season, leagueId) => new Set((read("data/api/postponed.json")[season]?.[leagueId] ?? []).map((p) => p.match));
