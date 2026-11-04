// Fails when a source has stalled: any current league season with games more than three days past and no result (meta.json `overdue`).
// Not part of the site build (a failed api build publishes no league pages at all); run it from a schedule or a monitor.
//   node scripts/api/check-fresh.mjs [public/api/v1/meta.json]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** One line per current league season with late results; empty when every league is up to date. */
export function check(meta) {
  const problems = [];
  for (const [league, seasons] of Object.entries(meta.leagues)) {
    const current = Object.keys(seasons).sort().at(-1);
    const s = seasons[current];
    if (s.overdue > 0) problems.push(`${league} ${current}: ${s.overdue} results more than 3 days late (newest result ${s.lastResult})`);
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const meta = JSON.parse(readFileSync(process.argv[2] ?? "public/api/v1/meta.json", "utf8"));
  const problems = check(meta);
  for (const p of problems) console.error(p);
  console.log(problems.length ? `api:check: ${problems.length} league(s) with late results` : "api:check: every league is up to date");
  process.exit(problems.length ? 1 : 0);
}
