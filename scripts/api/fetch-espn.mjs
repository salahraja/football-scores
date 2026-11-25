// Download each league's finished games from ESPN's football feeds and save our own summary of each (espn.mjs) into
// data/espn/<season>/<league>/<espn id>.json for scripts/api/build.mjs. Salah's decision, 25 November 2026: use the feeds while golboard
// has no customers (ESPN's terms allow personal use only; docs/api.md). So we ask as little as we can, from the build only, never from a
// visitor's browser:
//   - one scoreboard per league per day, for the last `days` days;
//   - for a game not saved yet, its summary and its plays (two pages), once, at least six hours after kick-off (the plays are still
//     corrected for about two hours after the final whistle);
//   - at most `max` games a run, one request at a time with a pause between.
// A failed download is reported and skipped; it never throws, so a build never stops for it. Node only, no dependencies.
//   node scripts/api/fetch-espn.mjs [--out data/espn] [--season 2026-27] [--days 3]
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { leagues } from "./config.mjs";
import { reduceMatch } from "./espn.mjs";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const CORE = "https://sports.core.api.espn.com/v2/sports/soccer/leagues";
const AGENT = "Mozilla/5.0 (site-check)";
const SETTLE = 6 * 3_600_000;

async function get(url, fetchFn, wait) {
  await wait();
  const res = await fetchFn(url, { headers: { "User-Agent": AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { reason: `HTTP ${res.status}` });
  return res.json();
}

export async function fetchMatches({ out, season = "2026-27", now = new Date(), days = 3, ids = leagues().map((l) => l.id), max = 40,
  fetchFn = fetch, wait = () => new Promise((r) => setTimeout(r, 700)) } = {}) {
  const report = { saved: [], kept: [], later: 0 };
  for (const league of leagues().filter((l) => l.espn && ids.includes(l.id))) {
    for (let d = 0; d < days; d++) {
      const day = new Date(now.getTime() - d * 86_400_000).toISOString().slice(0, 10);
      let events;
      try {
        events = (await get(`${SITE}/${league.espn}/scoreboard?dates=${day.replace(/-/g, "")}`, fetchFn, wait)).events ?? [];
      } catch (e) {
        report.kept.push(`${league.id} ${day} (${e?.reason ?? e?.name ?? "error"})`);
        continue;
      }
      for (const ev of events) {
        const target = join(out, season, league.id, `${ev.id}.json`);
        if (!ev.status?.type?.completed || Date.parse(ev.date) + SETTLE > now.getTime() || existsSync(target)) continue;
        if (report.saved.length >= max) { report.later += 1; continue; }
        try {
          const summary = await get(`${SITE}/${league.espn}/summary?event=${ev.id}`, fetchFn, wait);
          const base = `${CORE}/${league.espn}/events/${ev.id}/competitions/${ev.id}/plays?limit=1000`;
          const first = await get(`${base}&page=1`, fetchFn, wait);
          const pages = [first];
          for (let p = 2; p <= (first.pageCount ?? 1); p++) pages.push(await get(`${base}&page=${p}`, fetchFn, wait));
          const match = reduceMatch(summary, pages);
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(`${target}.tmp`, JSON.stringify(match));
          renameSync(`${target}.tmp`, target);
          report.saved.push(`${league.id}/${ev.id}`);
        } catch (e) {
          report.kept.push(`${league.id}/${ev.id} (${e?.reason ?? e?.name ?? "error"})`);
        }
      }
    }
  }
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const report = await fetchMatches({ out: arg("out", join(root, "data/espn")), season: arg("season", "2026-27"), days: Number(arg("days", "3")) });
  console.log(`espn: saved ${report.saved.length}${report.later ? `, ${report.later} left for the next run` : ""}${report.kept.length ? `; skipped ${report.kept.join(", ")}` : ""}`);
}
