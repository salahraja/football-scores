// Should the site be rebuilt? Yes when the facts changed since the last rebuild, or when a new day began; never more than a few times a day.
//   node scripts/api/refresh.mjs [--api public/api/v1] [--state data/refresh.json] [--fetch-log fetch.log] [--force]
// The site is static, so a result only shows after a build, and the host builds on every push. The scheduled job (.github/workflows/refresh.yml)
// builds the API from the sources, then runs this: it compares a digest of each matches, table and groups file with the digests saved in
// data/refresh.json. When they differ it writes the new digests there and the job commits that one file; the push makes the host build.
// No build hook and no secret. Files that change with the clock (today.json, meta.json, the calendars) are left out, or every run would
// look like news. Netlify's free plan has 300 build minutes a month and stops building past them: hence the gap and the day's cap.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { leagues, tournaments } from "./config.mjs";

const FACTS = new Set(["matches.json", "table.json", "groups.json"]);
export const LIMITS = { maxPerDay: 8, minGapMinutes: 45 };

/** { "it-1/2026-27/matches.json": sha256, ... } for every facts file under an api/v1 folder. */
export function digests(dir) {
  const out = {};
  const walk = (folder, prefix) => {
    for (const name of readdirSync(folder).sort()) {
      const path = join(folder, name);
      if (statSync(path).isDirectory()) walk(path, `${prefix}${name}/`);
      else if (FACTS.has(name)) out[`${prefix}${name}`] = createHash("sha256").update(readFileSync(path)).digest("hex");
    }
  };
  walk(dir, "");
  return out;
}

/** True unless both downloads said they saved everything ("openfootball: saved 16", with no "kept the saved copy of ..."). */
export function sourcesFailed(log) {
  const lines = log.split("\n");
  return ["openfootball", "wikipedia"].some((name) => {
    const said = lines.find((line) => line.startsWith(`${name}: saved`));
    return !said || said.includes("kept the saved copy");
  });
}

/** What to do now: { rebuild, why, changed: [paths], next: the state to save when rebuilding }. `previous` is the saved state, or null.
 *  A file that is gone is not a change and keeps its digest: a league is missing when its download failed, and that is not news.
 *  With `sourcesOk` false (a download failed this run) results are not compared at all, so a half-read league never causes a build
 *  and the saved digests stay those of the last good run; the once-a-day rebuild still happens. */
export function decide(previous, files, now = new Date(), { force = false, sourcesOk = true, maxPerDay = LIMITS.maxPerDay, minGapMinutes = LIMITS.minGapMinutes } = {}) {
  const day = now.toISOString().slice(0, 10);
  const before = previous?.files ?? {};
  const changed = sourcesOk ? Object.keys(files).filter((path) => before[path] !== files[path]).sort() : [];
  const builtToday = previous?.day === day ? previous.buildsToday : 0;
  const next = { files: sourcesOk ? { ...before, ...files } : before, changedAt: now.toISOString(), day, buildsToday: builtToday + 1 };
  const go = (why) => ({ rebuild: true, why, changed, next });
  const stay = (why) => ({ rebuild: false, why, changed, next: previous });
  const unread = "a source did not download, so results were not compared";
  if (force) return go("asked to");
  if (!previous) return sourcesOk ? go("first run") : stay(`${unread}; nothing is recorded yet`);
  if (changed.length === 0) {
    if (previous.day !== day) return go(sourcesOk ? "new day: each page lists this week's games" : `new day; ${unread}`);
    return stay(sourcesOk ? "nothing changed" : unread);
  }
  if (builtToday >= maxPerDay) return stay(`the day's cap of ${maxPerDay} rebuilds is reached`);
  const minutes = Math.floor((now.getTime() - Date.parse(previous.changedAt)) / 60_000);
  if (minutes < minGapMinutes) return stay(`changed, waiting: the last rebuild was ${minutes} minutes ago`);
  return go("results changed");
}

/** "Serie A, Champions League" for the files that changed: each competition once, in the order met. */
export function named(changed, names) {
  return [...new Set(changed.map((path) => path.split("/")[0]))].map((id) => names[id] ?? id).join(", ");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
  const statePath = arg("state", "data/refresh.json");
  const previous = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : null;
  const names = Object.fromEntries([...leagues(), ...tournaments()].map((c) => [c.id, c.name]));
  const fetchLog = arg("fetch-log", null);
  const sourcesOk = fetchLog ? !sourcesFailed(readFileSync(fetchLog, "utf8")) : true;
  const got = decide(previous, digests(arg("api", "public/api/v1")), new Date(), { force: process.argv.includes("--force"), sourcesOk });
  const what = named(got.changed, names);
  const message = got.why === "results changed" ? `Results changed: ${what}` : got.why.startsWith("new day") ? "A new day: this week's games" : `Rebuild (${got.why})`;
  console.log(got.rebuild ? `rebuild, ${got.why}${what ? `: ${what}` : ""}` : `no rebuild, ${got.why}${what ? ` (${what})` : ""}`);
  if (got.rebuild) writeFileSync(statePath, `${JSON.stringify(got.next, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `rebuild=${got.rebuild}\nmessage=${message}\n`);
}
