// Plain HTML pages made from the published API: /leagues/ and /leagues/<league>/ (table, latest results, next fixtures), with no
// JavaScript, so they show at once on a slow phone and give link previews and search engines a real page.
//   node scripts/api/pages.mjs [--api public/api/v1] [--out public]
// Each page says how far its results go and credits the sources it used. Node only, no dependencies.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { leagues } from "./config.mjs";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const day = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const short = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const SOURCES = {
  openfootball: '<a href="https://github.com/openfootball/football.json">openfootball</a> (public domain)',
  wikipedia: '<a href="https://en.wikipedia.org/">Wikipedia</a> (<a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>)',
};

const CSS = `:root {
  --bg: #f4f6f7; --card: #ffffff; --fg: #111418; --muted: #5f6670; --accent: #006fa8; --line: #e4e4e7; --radius: 8px;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) { :root { --bg: #000000; --card: #18181b; --fg: #f5f5f5; --muted: #a1a1aa; --accent: #5cc0f5; --line: #2a2a2e; color-scheme: dark; } }
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; font: 16px/1.45 var(--sans); background: var(--bg); color: var(--fg); }
.page { max-width: 46rem; margin: 0 auto; padding-block: 1rem 2.5rem;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.site { font-weight: 700; color: var(--accent); text-decoration: none; }
h1 { font-size: 1.75rem; margin: 0.5rem 0 0.25rem; text-wrap: balance; }
h2 { font-size: 1.125rem; margin: 2rem 0 0.75rem; }
.note { color: var(--muted); margin: 0 0 1rem; font-size: 0.875rem; }
.scroll { overflow-x: auto; }
.standings caption { text-align: left; caption-side: top; }
.standings { width: 100%; border-collapse: separate; border-spacing: 0 4px; font-variant-numeric: tabular-nums; }
.standings th, .standings td { padding: 0.6rem 0.4rem; text-align: center; }
.standings tbody th, .standings tbody td { background: var(--card); }
.standings thead th { color: var(--muted); font-weight: 600; font-size: 0.8125rem; }
.standings .left { text-align: left; }
.standings .pts { font-weight: 700; }
.standings tbody tr > :first-child { border-radius: var(--radius) 0 0 var(--radius); color: var(--muted); }
.standings tbody tr > :last-child { border-radius: 0 var(--radius) var(--radius) 0; }
.games { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.games li { display: grid; grid-template-columns: 1fr auto 1fr; gap: 0.75rem; align-items: center; background: var(--card);
  border-radius: var(--radius); padding: 0.6rem 0.75rem; font-variant-numeric: tabular-nums; }
.games .home { text-align: right; }
.games .mid { min-width: 4.5rem; text-align: center; font-weight: 700; }
.games .when { grid-column: 1 / -1; color: var(--muted); font-size: 0.8125rem; }
.list { list-style: none; padding: 0; display: grid; gap: 4px; }
.list a { display: block; background: var(--card); border-radius: var(--radius); padding: 0.85rem 1rem; text-decoration: none; font-weight: 600; color: var(--fg); }
.list span { color: var(--muted); font-weight: 400; }
footer { margin-top: 2.5rem; color: var(--muted); font-size: 0.8125rem; }
footer a { color: inherit; }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 400px) { .standings .wdl { display: none; } }
`;

function shell({ title, description, path, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} | golboard</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<link rel="canonical" href="${esc(path)}">
<link rel="stylesheet" href="/leagues/site.css">
</head>
<body>
<main class="page">
<a class="site" href="/leagues/">golboard</a>
${body}
</main>
</body>
</html>
`;
}

function game(m, names) {
  const mid = m.score ? `${m.score.ft[0]}–${m.score.ft[1]}` : (m.time ?? "–");
  const when = `${esc(m.round ?? "")} · ${short(m.date)}`;
  return `<li><span class="home">${esc(names[m.home])}</span><span class="mid">${esc(mid)}</span><span class="away">${esc(names[m.away])}</span><span class="when">${when}</span></li>`;
}

function leaguePage(league, competition, api) {
  const season = competition.current;
  const read = (f) => JSON.parse(readFileSync(join(api, league.id, season, f), "utf8"));
  const { table } = read("table.json");
  const { matches } = read("matches.json");
  const { teams } = read("teams.json");
  const all = JSON.parse(readFileSync(join(api, "meta.json"), "utf8"));
  const meta = all.leagues[league.id][season];
  const today = all.generatedAt.slice(0, 10);
  const league_games = matches.filter((m) => m.stage === "league");
  const latest = league_games.filter((m) => m.score).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  // A game from the build day or before with no score was played (or put off); its result is just not in yet. It is never "next".
  const waiting = league_games.filter((m) => !m.score && m.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  const next = league_games.filter((m) => !m.score && m.date > today).sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? ""))).slice(0, 10);
  const used = [...new Set(matches.map((m) => (m.source === "correction" ? "openfootball" : m.source)))].filter((s) => SOURCES[s]);
  const upTo = meta.lastResult ? `Results up to ${day(meta.lastResult)}` : "No results yet";
  const rows = table.map((r) => `<tr class="row"><td>${r.position}</td><th scope="row" class="left">${esc(teams[r.team])}</th><td>${r.played}</td>`
    + `<td class="wdl">${r.won}</td><td class="wdl">${r.drawn}</td><td class="wdl">${r.lost}</td><td>${r.gd > 0 ? "+" : ""}${r.gd}</td><td class="pts">${r.points}</td></tr>`).join("\n");
  const body = `<h1>${esc(league.name)}</h1>
<p class="note">${esc(league.country)} · ${esc(season)} · ${upTo}</p>
<div class="scroll"><table class="standings">
<caption class="note">Table worked out from the results, with ${esc(league.name)}'s own tie-break rules.</caption>
<thead><tr><th scope="col"><span aria-hidden="true">#</span><span class="note" hidden>Position</span></th><th scope="col" class="left">Team</th><th scope="col"><abbr title="Played">P</abbr></th><th scope="col" class="wdl"><abbr title="Won">W</abbr></th><th scope="col" class="wdl"><abbr title="Drawn">D</abbr></th><th scope="col" class="wdl"><abbr title="Lost">L</abbr></th><th scope="col"><abbr title="Goal difference">GD</abbr></th><th scope="col"><abbr title="Points">Pts</abbr></th></tr></thead>
<tbody>
${rows}
</tbody>
</table></div>
<h2>Latest results</h2>
${latest.length ? `<ul class="games">${latest.map((m) => game(m, teams)).join("\n")}</ul>` : '<p class="note">None yet.</p>'}
${waiting.length ? `<h2>Waiting for the result</h2>
<p class="note">Played, or due today; the score is not in our sources yet.</p>
<ul class="games">${waiting.map((m) => game(m, teams)).join("\n")}</ul>` : ""}
<h2>Next fixtures</h2>
${next.length ? `<ul class="games">${next.map((m) => game(m, teams)).join("\n")}</ul>` : '<p class="note">None left this season.</p>'}
<footer>Results from ${used.map((s) => SOURCES[s]).join(" and ")}. Kick-off times are ${esc(league.clock)}.</footer>`;
  return shell({ title: `${league.name} table, results and fixtures`, path: `/leagues/${league.id}/`, body,
    description: `${league.name} ${season}: the table, the latest results and the next fixtures. ${upTo}.` });
}

/** Write <out>/leagues/ from the API at <api>: index.html, site.css and <league>/index.html. All or nothing, like the API build. */
export function pages({ api = "public/api/v1", out = "public" } = {}) {
  const { competitions } = JSON.parse(readFileSync(join(api, "competitions.json"), "utf8"));
  const byId = new Map(competitions.map((c) => [c.id, c]));
  const files = new Map([["site.css", CSS]]);
  const served = leagues().filter((l) => byId.has(l.id));
  for (const league of served) files.set(`${league.id}/index.html`, leaguePage(league, byId.get(league.id), api));
  files.set("index.html", shell({ title: "Leagues", path: "/leagues/", description: "Tables, results and fixtures for eight European leagues.",
    body: `<h1>Leagues</h1>\n<ul class="list">${served.map((l) => `<li><a href="/leagues/${l.id}/">${esc(l.name)} <span>${esc(l.country)}</span></a></li>`).join("\n")}</ul>` }));
  const fresh = join(out, "leagues.next"), live = join(out, "leagues"), old = join(out, "leagues.old");
  rmSync(fresh, { recursive: true, force: true });
  for (const [path, text] of files) {
    mkdirSync(dirname(join(fresh, path)), { recursive: true });
    writeFileSync(join(fresh, path), text);
  }
  rmSync(old, { recursive: true, force: true });
  try { renameSync(live, old); } catch { /* first build */ }
  renameSync(fresh, live);
  rmSync(old, { recursive: true, force: true });
  return { pages: files.size - 1 };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const done = pages({ api: arg("api", join(root, "public/api/v1")), out: arg("out", join(root, "public")) });
  console.log(`pages: ${done.pages} pages`);
}
