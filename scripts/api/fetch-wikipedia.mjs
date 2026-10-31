// Download each league season's results grid from English Wikipedia (CC BY-SA 4.0) into data/wikipedia/<season>/<league>.json for
// scripts/api/build.mjs, through the MediaWiki API with a User-Agent that names us, as Wikimedia asks.
//   node scripts/api/fetch-wikipedia.mjs [--out data/wikipedia] [--seasons 2026-27]
// Only the grid is kept (the Sports table / sports results module calls), with the revision it came from. Some pages keep the grid in a
// template ({{2026–27 La Liga table|show_matches=only}}); that template is read instead. A failed or gridless download keeps the saved
// file and says why; it never throws, so a build never stops for lack of fresh data. Node only, no dependencies.
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { leagues } from "./config.mjs";

const API = "https://en.wikipedia.org/w/api.php";
const AGENT = "golboard/0.1 (https://github.com/salahraja/football-scores; salah@ranoo.org)";

/** The module calls that hold a results grid, each up to its matching }}. */
export function grids(text) {
  const out = [];
  for (const m of text.matchAll(/\{\{#invoke:\s*[Ss]ports (?:table|results)/g)) {
    let depth = 0, j = m.index;
    while (j < text.length) {
      if (text.startsWith("{{", j)) { depth += 1; j += 2; continue; }
      if (text.startsWith("}}", j)) { depth -= 1; j += 2; if (depth === 0) break; continue; }
      j += 1;
    }
    const block = text.slice(m.index, j);
    if (/\|\s*match_/.test(block)) out.push(block);
  }
  return out.join("\n");
}

async function page(title, fetchFn) {
  const query = new URLSearchParams({ action: "query", prop: "revisions", rvprop: "content|ids|timestamp", rvslots: "main", titles: title,
    redirects: "1", format: "json", formatversion: "2" });
  const res = await fetchFn(`${API}?${query.toString().replace(/\+/g, "%20")}`, { headers: { "User-Agent": AGENT }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { reason: `HTTP ${res.status}` });
  const found = (await res.json())?.query?.pages?.[0];
  const rev = found?.revisions?.[0];
  if (!rev) throw Object.assign(new Error("no such page"), { reason: "no such page" });
  return { title: found.title, revid: rev.revid, timestamp: rev.timestamp, text: rev.slots.main.content };
}

export async function fetchPages({ out, seasons, ids = leagues().map((l) => l.id), fetchFn = fetch } = {}) {
  const report = { saved: [], kept: [] };
  for (const season of seasons) {
    const dashed = season.replace("-", "–");
    for (const league of leagues().filter((l) => ids.includes(l.id))) {
      const name = `${season}/${league.id}`;
      try {
        let got = await page(`${dashed} ${league.wikipedia}`, fetchFn);
        let wikitext = grids(got.text);
        if (!wikitext) {
          // the grid lives in a template the page transcludes: {{2026–27 La Liga table|show_matches=only}}
          const template = got.text.match(new RegExp(`\\{\\{\\s*(${dashed} [^|}]+? table)\\s*\\|`));
          if (template) {
            got = await page(`Template:${template[1]}`, fetchFn);
            wikitext = grids(got.text);
          }
        }
        if (!wikitext) { report.kept.push(`${name} (no results grid)`); continue; }
        const target = join(out, season, `${league.id}.json`);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(`${target}.tmp`, JSON.stringify({ title: got.title, revid: got.revid, timestamp: got.timestamp, wikitext }));
        renameSync(`${target}.tmp`, target);
        report.saved.push(name);
      } catch (e) {
        report.kept.push(`${name} (${e?.reason ?? e?.name ?? "error"})`);
      }
    }
  }
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const report = await fetchPages({ out: arg("out", join(root, "data/wikipedia")), seasons: arg("seasons", "2026-27").split(",") });
  console.log(`wikipedia: saved ${report.saved.length}${report.kept.length ? `; kept the saved copy of ${report.kept.join(", ")}` : ""}`);
}
