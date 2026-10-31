// golboard's API: a folder of static JSON built from saved source files (no server, and no key in any app).
//   node scripts/api/build.mjs [--input data/openfootball] [--out public] [--seasons 2025-26,2026-27]
// writes <out>/api/v1/competitions.json, <out>/api/v1/<league>/<season>/{matches,table,teams}.json and <out>/api/v1/meta.json.
// Every season is checked before anything is written; one failure and nothing is written, so the last good API stays up.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { leagues, loadAdjustments, loadCorrections } from "./config.mjs";
import { applyCorrections, parseSeason } from "./openfootball.mjs";
import { computeTable } from "./table.mjs";

const OPENFOOTBALL = { name: "openfootball", url: "https://github.com/openfootball/football.json", licence: "CC0-1.0" };
const goal = (n) => Number.isInteger(n) && n >= 0 && n < 50;

/** Problems with one league season, in plain words; empty when it is fine. */
export function validate(season, teams) {
  const problems = [];
  const ids = new Set();
  for (const m of season.matches) {
    if (ids.has(m.id)) problems.push(`duplicate id ${m.id}`);
    ids.add(m.id);
    if (m.home === m.away) problems.push(`${m.id}: a team plays itself`);
    if (!teams[m.home] || !teams[m.away]) problems.push(`${m.id}: a team with no name`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date ?? "")) problems.push(`${m.id}: no date`);
    if (m.status === "finished" && !(m.score && m.score.ft.every(goal) && (m.score.ht === null || m.score.ht.every(goal))))
      problems.push(`${m.id}: impossible score ${JSON.stringify(m.score)}`);
    if (m.status === "scheduled" && m.score) problems.push(`${m.id}: a score on a game not played`);
  }
  return problems;
}

/** Build everything in memory, check it, then write it all at once. Throws (writing nothing) when any season fails validation. */
export function build({ input = "data/openfootball", out = "public", seasons = ["2025-26", "2026-27"], now = new Date().toISOString(), mutate } = {}) {
  const files = new Map();
  const meta = { version: 1, generatedAt: now, sources: [OPENFOOTBALL], leagues: {} };
  const competitions = [];
  const problems = [];
  for (const league of leagues()) {
    const have = [];
    for (const season of seasons) {
      const path = join(input, season, `${league.openfootball}.json`);
      if (!existsSync(path)) continue;
      const parsed = parseSeason(JSON.parse(readFileSync(path, "utf8")), league.id);
      parsed.matches = applyCorrections(parsed.matches, loadCorrections(season, league.id));
      mutate?.(parsed);
      problems.push(...validate(parsed, parsed.teams).map((p) => `${league.id} ${season}: ${p}`));
      const adjustments = loadAdjustments(season, league.id);
      const table = computeTable(parsed.matches, league, adjustments);
      const finished = parsed.matches.filter((m) => m.status === "finished");
      const base = `api/v1/${league.id}/${season}`;
      files.set(`${base}/matches.json`, { competition: league.id, season, matches: parsed.matches });
      files.set(`${base}/table.json`, { competition: league.id, season, table, adjustments });
      files.set(`${base}/teams.json`, { competition: league.id, season, teams: parsed.teams });
      // How far the source has got: the app says "results up to <date>" rather than pretending a stale table is live.
      meta.leagues[league.id] ??= {};
      meta.leagues[league.id][season] = { finished: finished.length, scheduled: parsed.matches.length - finished.length,
        lastResult: finished.reduce((d, m) => (m.date > d ? m.date : d), "") || null,
        corrections: parsed.matches.filter((m) => m.source === "correction").length };
      have.push(season);
    }
    if (have.length) competitions.push({ id: league.id, name: league.name, country: league.country, seasons: have, current: have.at(-1) });
  }
  if (problems.length) throw new Error(`validation failed, nothing written:\n${problems.slice(0, 20).join("\n")}`);
  files.set("api/v1/competitions.json", { competitions });
  files.set("api/v1/meta.json", meta);
  // Write beside the old API, then swap, so a reader never sees half of one build and half of another.
  const fresh = join(out, "api.next"), live = join(out, "api"), old = join(out, "api.old");
  rmSync(fresh, { recursive: true, force: true });
  for (const [path, body] of files) {
    const target = join(fresh, path.replace(/^api\//, ""));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(body));
  }
  rmSync(old, { recursive: true, force: true });
  if (existsSync(live)) renameSync(live, old);
  renameSync(fresh, live);
  rmSync(old, { recursive: true, force: true });
  return { files: files.size, competitions: competitions.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const done = build({ input: arg("input", join(root, "data/openfootball")), out: arg("out", join(root, "public")),
    seasons: arg("seasons", "2025-26,2026-27").split(",") });
  console.log(`api: ${done.files} files for ${done.competitions} competitions`);
}
