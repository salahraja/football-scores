// Download openfootball's season files (public domain) into data/openfootball/<season>/<code>.json for scripts/api/build.mjs.
//   node scripts/api/fetch-openfootball.mjs [--out data/openfootball] [--seasons 2025-26,2026-27]
// Node only, no dependencies, no key. A file is replaced only when the download works and looks like a season; otherwise the saved one is kept
// and the reason printed. It never fails, so a build never stops for lack of fresh data.
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { leagues } from "./config.mjs";

const BASE = "https://raw.githubusercontent.com/openfootball/football.json/master";
const looksLikeSeason = (body) => body && typeof body.name === "string" && Array.isArray(body.matches)
  && body.matches.every((m) => m && typeof m.team1 === "string" && typeof m.team2 === "string" && typeof m.date === "string");

export async function fetchSeasons({ out, seasons, codes = leagues().map((l) => l.openfootball), fetchFn = fetch } = {}) {
  const report = { saved: [], kept: [] };
  for (const season of seasons) {
    for (const code of codes) {
      const name = `${season}/${code}`;
      let body;
      try {
        const res = await fetchFn(`${BASE}/${season}/${code}.json`, { signal: AbortSignal.timeout(20_000) });
        if (!res.ok) { report.kept.push(`${name} (HTTP ${res.status})`); continue; }
        body = await res.json();
      } catch (e) {
        report.kept.push(`${name} (${e?.name ?? "error"})`);
        continue;
      }
      if (!looksLikeSeason(body)) { report.kept.push(`${name} (not a season file)`); continue; }
      const target = join(out, season, `${code}.json`);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(`${target}.tmp`, JSON.stringify(body));
      renameSync(`${target}.tmp`, target);
      report.saved.push(name);
    }
  }
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const report = await fetchSeasons({ out: arg("out", join(root, "data/openfootball")), seasons: arg("seasons", "2025-26,2026-27").split(",") });
  console.log(`openfootball: saved ${report.saved.length}${report.kept.length ? `; kept the saved copy of ${report.kept.join(", ")}` : ""}`);
}
