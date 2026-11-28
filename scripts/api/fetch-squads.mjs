// Each league club's squad from ESPN's football feeds, for the onboarding's player step (Salah, 2026-11-25), into
// data/espn/<season>/<league>/squads/<espn team id>.json: the players' ESPN ids, names, shirt numbers and positions, nothing else.
// The same decision as the game detail (fetch-espn.mjs, docs/api.md): only the build asks, as little as it can:
//   - one team list per league, kept a week too;
//   - each club's squad at most once a week (squads change at transfer windows), at most `max` a run, one request at a time.
// A failed download is reported and the saved squad kept; it never throws. Node only, no dependencies.
//   node scripts/api/fetch-squads.mjs [--out data/espn] [--season 2026-27]
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { leagues } from "./config.mjs";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const AGENT = "Mozilla/5.0 (site-check)";
const WEEK = 7 * 86_400_000;

/** Our part of one squad feed: the team, and each player's id, name, number and position (G, D, M, F). */
export function reduceSquad(feed) {
  return { team: { id: String(feed.team.id), name: feed.team.displayName },
    players: (feed.athletes ?? []).map((a) => ({ id: String(a.id), name: a.displayName, number: a.jersey ? Number(a.jersey) : null, position: a.position?.abbreviation ?? null })) };
}

async function get(url, fetchFn, wait) {
  await wait();
  const res = await fetchFn(url, { headers: { "User-Agent": AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { reason: `HTTP ${res.status}` });
  return res.json();
}

export async function fetchSquads({ out, season = "2026-27", now = new Date(), ids = leagues().map((l) => l.id), max = 60,
  fetchFn = fetch, wait = () => new Promise((r) => setTimeout(r, 700)) } = {}) {
  const report = { saved: [], kept: [], later: 0 };
  for (const league of leagues().filter((l) => l.espn && ids.includes(l.id))) {
    const dir = join(out, season, league.id, "squads");
    // the league's clubs, kept a week like the squads, so a run with nothing due asks nothing
    const list = join(dir, "_teams.json");
    const fresh = (f) => existsSync(f) && now.getTime() - statSync(f).mtimeMs <= WEEK;
    let clubs;
    try {
      if (fresh(list)) clubs = JSON.parse(readFileSync(list, "utf8"));
      else {
        clubs = ((await get(`${SITE}/${league.espn}/teams`, fetchFn, wait)).sports?.[0]?.leagues?.[0]?.teams ?? []).map((t) => ({ id: String(t.team.id), name: t.team.displayName }));
        mkdirSync(dir, { recursive: true });
        writeFileSync(`${list}.tmp`, JSON.stringify(clubs));
        renameSync(`${list}.tmp`, list);
      }
    } catch (e) {
      report.kept.push(`${league.id} teams (${e?.reason ?? e?.name ?? "error"})`);
      continue;
    }
    const due = clubs.filter((c) => !fresh(join(dir, `${c.id}.json`)));
    if (!due.length) continue;
    for (const club of due) {
      if (report.saved.length >= max) { report.later += 1; continue; }
      const target = join(dir, `${club.id}.json`);
      try {
        const squad = reduceSquad(await get(`${SITE}/${league.espn}/teams/${club.id}/roster`, fetchFn, wait));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(`${target}.tmp`, JSON.stringify(squad));
        renameSync(`${target}.tmp`, target);
        report.saved.push(`${league.id}/${club.id}`);
      } catch (e) {
        report.kept.push(`${league.id}/${club.id} (${e?.reason ?? e?.name ?? "error"})`);
      }
    }
  }
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const report = await fetchSquads({ out: arg("out", join(root, "data/espn")), season: arg("season", "2026-27") });
  console.log(`squads: saved ${report.saved.length}${report.later ? `, ${report.later} left for the next run` : ""}${report.kept.length ? `; skipped ${report.kept.join(", ")}` : ""}`);
}
