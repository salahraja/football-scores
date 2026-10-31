// Plain HTML pages made from the published API: /leagues/ and /leagues/<league>/, in the site's Stadio look (Salah, 2026-10-30: a slate
// poster with the league in brick-red condensed capitals over the game of the moment, then glass boxes). No framework; the one script is
// the optional live scores. Each page says how far its results go and credits the sources it used.
//   node scripts/api/pages.mjs [--api public/api/v1] [--out public]
// Node only, no dependencies.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { leagues } from "./config.mjs";
import { CLUB_WORDS, aliasMap, slug } from "./teams.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTS = ["barlow-condensed-800-latin.woff2", "instrument-sans-latin.woff2"];  // both SIL Open Font License, from the facelift branch
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const day = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const short = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const SOURCES = {
  openfootball: '<a href="https://github.com/openfootball/football.json">openfootball</a> (public domain)',
  wikipedia: '<a href="https://en.wikipedia.org/">Wikipedia</a> (<a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>)',
};

const CSS = `@font-face { font-family: "Barlow Condensed"; font-weight: 800; font-display: swap; src: url("/leagues/fonts/barlow-condensed-800-latin.woff2") format("woff2"); }
@font-face { font-family: "Instrument Sans"; font-weight: 400 700; font-display: swap; src: url("/leagues/fonts/instrument-sans-latin.woff2") format("woff2"); }
/* Stadio: slate to paper, brick red condensed capitals, near-black; boxes are glass (the facelift's tokens) */
:root {
  --bg: #eeeeec; --card: #f7f7f5; --slate: #6f7e98; --slate-2: #a9b3c3; --fg: #1b1c20; --muted: #5b5f68; --accent: #b3261e;
  --line: rgb(27 28 32 / 12%); --glass: rgb(250 250 252 / 58%); --glass-solid: #f7f7f5; --rim: rgb(255 255 255 / 70%);
  --display: "Barlow Condensed", "Arial Narrow", sans-serif; --sans: "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
}
@media (prefers-color-scheme: dark) { :root {
  --bg: #17191d; --card: #23262c; --slate: #2c3442; --slate-2: #3b4556; --fg: #eef0f3; --muted: #a3a9b4; --accent: #c4302a;
  --line: rgb(255 255 255 / 12%); --glass: rgb(40 43 50 / 70%); --glass-solid: #23262c; --rim: rgb(255 255 255 / 22%); color-scheme: dark; } }
*, *::before, *::after { box-sizing: border-box; }
html { background: var(--bg); overflow-x: clip; }
body { margin: 0; font: 16px/1.45 var(--sans); color: var(--fg); background: var(--bg); overflow-x: clip; }
a { color: inherit; }
a:focus-visible { outline: 3px solid var(--accent); outline-offset: 4px; }
.nav { position: sticky; top: calc(10px + env(safe-area-inset-top, 0px)); z-index: 10; display: flex; gap: 2px; width: fit-content;
  max-width: calc(100% - 20px); margin: 12px auto 0; padding: 6px; border-radius: 999px; background: var(--glass);
  -webkit-backdrop-filter: saturate(180%) blur(28px); backdrop-filter: saturate(180%) blur(28px);
  box-shadow: inset 0 1px 0 var(--rim), 0 10px 30px -12px rgb(27 28 32 / 35%); }
.nav a { padding: 8px 14px; border-radius: 999px; text-decoration: none; font-weight: 700; font-size: 0.875rem; white-space: nowrap; }
.nav a[aria-current="page"] { background: var(--fg); color: var(--bg); }
.poster { margin-top: -60px; padding: 84px max(16px, env(safe-area-inset-right, 0px)) 2.5rem max(16px, env(safe-area-inset-left, 0px));
  background: linear-gradient(180deg, var(--slate), var(--slate-2) 60%, var(--bg)); text-align: center; }
/* the league's name as big as its longest word allows between the arrows (Barlow Condensed capitals run about 0.52 em a letter) */
.poster h1 { font: 800 min(22vw, calc((100vw - 150px) / (var(--n, 8) * 0.52)), 17rem)/0.82 var(--display); color: var(--accent);
  text-transform: uppercase; margin: 0; letter-spacing: -0.01em; overflow-wrap: normal; }
.titlebar { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 4px; max-width: 72rem; margin: 0 auto; }
.arrow { display: inline-grid; place-items: center; width: 44px; height: 44px; border: 0; border-radius: 999px; cursor: pointer; text-decoration: none;
  font: 800 1.75rem/1 var(--display); color: var(--fg); background: var(--glass); -webkit-backdrop-filter: saturate(180%) blur(28px);
  backdrop-filter: saturate(180%) blur(28px); box-shadow: inset 0 1px 0 var(--rim), 0 8px 20px -10px rgb(27 28 32 / 40%); }
.arrow:active { transform: scale(0.94); }
.arrow[hidden] { display: none; }
.feature .arrow[hidden] { display: inline-grid; visibility: hidden; }  /* keeps the score centred before the script shows them */
.feature { display: grid; grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr) auto; align-items: center; gap: 6px clamp(8px, 2vw, 22px);
  max-width: 64rem; margin: 0.75rem auto 0;
  grid-template-areas: "prev home mid away next" ". state state state ." ". events events events ." ". when when when ."; }
.feature .prev { grid-area: prev; } .feature .next { grid-area: next; } .feature .home { grid-area: home; } .feature .mid { grid-area: mid; }
.feature .away { grid-area: away; } .feature .state { grid-area: state; } .feature .events { grid-area: events; } .feature .when { grid-area: when; }
.feature .home, .feature .away { font: 800 clamp(1.25rem, 6.4vw, 5.5rem)/0.92 var(--display); text-transform: uppercase; overflow-wrap: normal; min-width: 0; }
/* a phone: the game arrows go under the score, beside the date, so the names keep their width */
@media (max-width: 560px) {
  .feature { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    grid-template-areas: "home mid away" "state state state" "events events events" "prev when next"; }
  .feature .prev { justify-self: end; } .feature .next { justify-self: start; }
  .arrow { width: 40px; height: 40px; }
}
.feature .home { text-align: right; } .feature .away { text-align: left; }
.feature .mid { font: 800 clamp(3rem, 12vw, 9.5rem)/0.85 var(--display); color: var(--accent); white-space: nowrap; }
.feature .when { opacity: 0.8; font-size: 0.9375rem; }
.feature .state { color: var(--accent); font-weight: 700; }
.board { max-width: 72rem; margin: 0 auto; padding-block: 0.5rem 3rem;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
  display: grid; gap: 1.5rem; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); align-items: start; }
.side { display: grid; gap: 1.5rem; align-content: start; min-width: 0; }
@media (max-width: 860px) { .board { grid-template-columns: minmax(0, 1fr); } }
.glass { position: relative; isolation: isolate; padding: 1.5rem; border-radius: 32px; background: var(--glass); min-width: 0;
  -webkit-backdrop-filter: saturate(180%) blur(28px); backdrop-filter: saturate(180%) blur(28px);
  box-shadow: inset 0 1px 0 var(--rim), 0 18px 40px -16px rgb(27 28 32 / 35%), 0 2px 6px rgb(27 28 32 / 8%); }
.glass::before { content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px; pointer-events: none;
  background: linear-gradient(135deg, rgb(255 255 255 / 90%), rgb(255 255 255 / 16%) 35%, rgb(255 255 255 / 10%) 65%, rgb(255 255 255 / 55%));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); }
@media (prefers-color-scheme: dark) { .glass::before { opacity: 0.35; } }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { .glass, .nav { background: var(--glass-solid); } }
@media (prefers-reduced-transparency: reduce) { .glass, .nav { -webkit-backdrop-filter: none; backdrop-filter: none; background: var(--glass-solid); } }
h2 { font: 800 1.9rem/1 var(--display); text-transform: uppercase; margin: 0 0 0.75rem; }
.note { color: var(--muted); margin: 0 0 0.75rem; font-size: 0.875rem; }
.scroll { overflow-x: auto; }
.standings { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; text-align: right; }
.standings caption { text-align: left; caption-side: bottom; color: var(--muted); font-size: 0.8125rem; padding-top: 0.75rem; }
.standings thead th { color: var(--muted); font-size: 0.8125rem; font-weight: 600; padding: 6px; border-bottom: 1px solid var(--line); }
.standings td, .standings tbody th { padding: 9px 6px; border-bottom: 1px solid var(--line); font-weight: 400; }
.standings .left { text-align: left; } .standings .pts { font-weight: 700; }
.standings td.pos { font: 800 1.15rem var(--display); opacity: 0.6; text-align: left; }
.games { list-style: none; margin: 0; padding: 0; }
.games > li { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 0.5rem; align-items: center; padding: 10px 0;
  border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
.games > li:last-child { border-bottom: 0; }
.games .home { text-align: right; } .games .home, .games .away { overflow-wrap: anywhere; min-width: 0; }
.games .mid { font: 800 1.35rem/1 var(--display); padding: 5px 10px; border-radius: 12px; min-width: 3.4rem; text-align: center;
  background: rgb(255 255 255 / 80%); color: #1b1c20; box-shadow: 0 1px 2px rgb(27 28 32 / 12%); }
.games .state { grid-column: 1 / -1; text-align: center; color: var(--accent); font-weight: 700; font-size: 0.8125rem; }
.events { grid-column: 1 / -1; list-style: none; margin: 2px 0 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; column-gap: 1.25rem;
  font-size: 0.8125rem; color: var(--muted); }
.events .ev-home { grid-column: 1; text-align: right; } .events .ev-away { grid-column: 2; text-align: left; }
.feature .events { font-size: 0.9375rem; color: inherit; opacity: 0.85; max-width: 40rem; margin: 0.5rem auto 0; width: 100%; }
.games .when { grid-column: 1 / -1; text-align: center; color: var(--muted); font-size: 0.8125rem; }
.list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); }
.list a { display: block; text-decoration: none; }
.list b { display: block; font: 800 2rem/1 var(--display); text-transform: uppercase; color: var(--accent); }
.list span { color: var(--muted); }
footer { grid-column: 1 / -1; color: var(--muted); font-size: 0.8125rem; }
@media (max-width: 400px) { .standings .wdl { display: none; } }
@media (prefers-reduced-motion: no-preference) { .glass { transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1); } }
`;

function shell({ title, description, path, body, live = null, here = "", script = false }) {
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
<link rel="preload" href="/leagues/fonts/barlow-condensed-800-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/leagues/site.css">
${script ? '<script src="/leagues/live.js" defer></script>\n' : ""}</head>
<body${live ? ` data-sportscore="${esc(live)}"` : ""}>
<nav class="nav" aria-label="Site"><a href="/leagues/"${here === "all" ? ' aria-current="page"' : ""}>Leagues</a>${here === "league" ? '<a href="#table">Table</a><a href="#week">This week</a>' : ""}</nav>
${body}
</body>
</html>
`;
}

const marks = (m) => (m.score ? "" : ` data-date="${m.date}" data-home="${esc(m.home)}" data-away="${esc(m.away)}"`);
const mid = (m) => (m.score ? `${m.score.ft[0]}–${m.score.ft[1]}` : (m.time ?? "vs"));  // a lone dash looked like a score

function game(m, names, today = null) {
  const late = today && !m.score && m.date < today ? " · result not in" : "";
  return `<li${marks(m)}><span class="home">${esc(names[m.home])}</span><span class="mid">${esc(mid(m))}</span><span class="away">${esc(names[m.away])}</span><span class="when">${esc(m.round ?? "")} · ${short(m.date)}${late}</span></li>`;
}

/** The poster's game: the week's first unscored game that has kicked off or is about to (live scores fill it), else the latest result. */
function featured(week, latest, names, today) {
  const m = week.find((g) => g.date >= today) ?? latest[0] ?? week[0];
  if (!m) return "";
  // the arrows step through the page's games (live.js shows them; without it the poster just shows this game)
  const arrow = (dir, step, label) => `<button class="arrow ${dir}" type="button" data-step="${step}" aria-label="${label}" hidden><span aria-hidden="true">${step < 0 ? "‹" : "›"}</span></button>`;
  return `<div class="feature"${marks(m)}>${arrow("prev", -1, "Previous game")}<span class="home">${esc(names[m.home])}</span><span class="mid">${esc(mid(m))}</span><span class="away">${esc(names[m.away])}</span>${arrow("next", 1, "Next game")}<span class="when">${esc(m.round ?? "")} · ${short(m.date)}</span></div>`;
}

function leaguePage(league, competition, api, before, after) {
  const season = competition.current;
  const read = (f) => JSON.parse(readFileSync(join(api, league.id, season, f), "utf8"));
  const { table } = read("table.json");
  const { matches } = read("matches.json");
  const { teams } = read("teams.json");
  const all = JSON.parse(readFileSync(join(api, "meta.json"), "utf8"));
  const meta = all.leagues[league.id][season];
  const today = all.generatedAt.slice(0, 10);
  const leagueGames = matches.filter((m) => m.stage === "league");
  const latest = leagueGames.filter((m) => m.score).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  // This week: every unscored game up to three days ahead, first on the page. A game from before the build day with no score was played
  // (or put off) and its result is just not in yet, so it is never "next"; and a schedule can be a day out (openfootball had LaLiga's
  // 31 October games on 1 November), so the live script pairs games by their two teams within three days.
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
  const byKickoff = (a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? ""));
  const unscored = leagueGames.filter((m) => !m.score && m.date <= soon).sort(byKickoff);
  // games from today on first; one from before today with no score (put off, or its result is late) goes last, marked
  const week = [...unscored.filter((m) => m.date >= today), ...unscored.filter((m) => m.date < today)];
  const next = leagueGames.filter((m) => !m.score && m.date > soon).sort(byKickoff).slice(0, 10);
  const used = [...new Set(matches.map((m) => (m.source === "correction" ? "openfootball" : m.source)))].filter((s) => SOURCES[s]);
  // live scores from SportScore only where it covers the league and the page has games still to play
  const live = league.sportscore && (week.length || next.length) ? league.sportscore : null;
  const upTo = meta.lastResult ? `Results up to ${day(meta.lastResult)}` : "No results yet";
  const rows = table.map((r) => `<tr class="row"><td class="pos">${r.position}</td><th scope="row" class="left">${esc(teams[r.team])}</th><td>${r.played}</td>`
    + `<td class="wdl">${r.won}</td><td class="wdl">${r.drawn}</td><td class="wdl">${r.lost}</td><td>${r.gd > 0 ? "+" : ""}${r.gd}</td><td class="pts">${r.points}</td></tr>`).join("\n");
  const list = (games) => `<ul class="games" aria-live="polite">${games.map((m) => game(m, teams, today)).join("\n")}</ul>`;
  const go = (l, dir, word) => `<a class="arrow ${dir}" href="/leagues/${l.id}/" aria-label="${word} league: ${esc(l.name)}"><span aria-hidden="true">${dir === "prev" ? "‹" : "›"}</span></a>`;
  const body = `<header class="poster">
<div class="titlebar">${go(before, "prev", "Previous")}<h1 style="--n: ${Math.max(...league.name.split(/\s+/).map((w) => w.length))}">${esc(league.name)}</h1>${go(after, "next", "Next")}</div>
${featured(week, latest, teams, today)}
<p class="note">${esc(league.country)} · ${esc(season)} · ${upTo}</p>
</header>
<main class="board">
${week.length ? `<section class="glass" id="week">
<h2>This week</h2>
<p class="note">${live ? "Scores update every minute while games are on." : "Games played or due in the next few days."} Kick-offs are ${esc(league.clock)}.</p>
${list(week)}
</section>` : ""}
<section class="glass" id="table">
<h2>The table</h2>
<div class="scroll"><table class="standings">
<caption>Worked out from the results, with ${esc(league.name)}'s own tie-break rules.</caption>
<thead><tr><th scope="col" class="left"><span aria-hidden="true">#</span><span class="note" hidden>Position</span></th><th scope="col" class="left">Club</th><th scope="col"><abbr title="Played">P</abbr></th><th scope="col" class="wdl"><abbr title="Won">W</abbr></th><th scope="col" class="wdl"><abbr title="Drawn">D</abbr></th><th scope="col" class="wdl"><abbr title="Lost">L</abbr></th><th scope="col"><abbr title="Goal difference">GD</abbr></th><th scope="col"><abbr title="Points">Pts</abbr></th></tr></thead>
<tbody>
${rows}
</tbody>
</table></div>
</section>
<div class="side">
<section class="glass">
<h2>Latest results</h2>
${latest.length ? list(latest) : '<p class="note">None yet.</p>'}
</section>
<section class="glass">
<h2>Next fixtures</h2>
${next.length ? list(next) : '<p class="note">None left this season.</p>'}
</section>
</div>
<footer>Results from ${used.map((s) => SOURCES[s]).join(" and ")}. Kick-off times are ${esc(league.clock)}.${live ? ' Live scores <a href="https://sportscore.com/">powered by SportScore</a>.' : ""}</footer>
</main>`;
  return shell({ title: `${league.name} table, results and fixtures`, path: `/leagues/${league.id}/`, body, live, here: "league", script: true,
    description: `${league.name} ${season}: the table, the latest results and the next fixtures. ${upTo}.` });
}

/** The browser script for live scores (/leagues/live.js). It names clubs with the same slug and aliases as teams.mjs (the function's own
 *  source is copied in, so the two cannot drift), asks SportScore once a minute for today's games of the page's league, writes each score
 *  and state into every element marked with the same two teams (the poster and the row), and stops when they have all finished. */
export function liveScript() {
  return `(function () {
  var CLUB_WORDS = new Set(${JSON.stringify([...CLUB_WORDS])});
  var aliases = ${JSON.stringify(aliasMap())};
  var slug = ${slug.toString()};
  function teamId(name) { var s = slug(name); return aliases[s] !== undefined ? aliases[s] : s; }
  window.golboardLive = { teamId: teamId };
  // the poster's arrows step through every game on the page, in page order, going round; once used, the poster stays where it was put
  var feature = document.querySelector ? document.querySelector(".feature") : null;
  function games() { return Array.prototype.slice.call(document.querySelectorAll(".games > li")); }
  function text(el, k) { var x = el.querySelector(k); return x ? x.textContent : ""; }
  function step(by) {
    var all = games();
    if (!all.length) return;
    var at = all.findIndex(function (li) { return text(li, ".home") === text(feature, ".home") && text(li, ".away") === text(feature, ".away"); });
    var li = all[(at + by + all.length) % all.length];
    [".home", ".mid", ".away", ".when"].forEach(function (k) { feature.querySelector(k).textContent = text(li, k); });
    ["date", "home", "away", "state"].forEach(function (k) { if (li.dataset[k]) feature.dataset[k] = li.dataset[k]; else delete feature.dataset[k]; });
    [".state", ".events"].forEach(function (k) {
      var mine = feature.querySelector(k), theirs = li.querySelector(k);
      if (mine) mine.remove();
      if (theirs) feature.insertBefore(theirs.cloneNode(true), feature.querySelector(".when"));
    });
    feature.dataset.pinned = "1";
  }
  if (feature) {
    Array.prototype.forEach.call(feature.querySelectorAll(".arrow"), function (b) {
      b.hidden = games().length < 2;
      b.addEventListener("click", function () { step(Number(b.dataset.step)); });
    });
  }
  var league = document.body && document.body.dataset ? document.body.dataset.sportscore : null;
  if (!league) return;
  function today() { return new Date().toISOString().slice(0, 10); }
  // unscored games within three days of today: a schedule can be a day out, and two teams meet at one ground once a season
  function near(date) { return Math.abs(Date.parse(date + "T00:00:00Z") - Date.parse(today() + "T00:00:00Z")) <= 3 * 86400000; }
  function rows() { return Array.prototype.filter.call(document.querySelectorAll("[data-home]"), function (r) { return near(r.dataset.date) || r.classList.contains("feature"); }); }
  function show(row, m) {
    if (m.status === "upcoming" || m.home_score == null || m.away_score == null) return;
    row.querySelector(".mid").textContent = m.home_score + "\\u2013" + m.away_score;
    var state = row.querySelector(".state");
    if (!state) { state = document.createElement("span"); state.className = "state"; row.insertBefore(state, row.querySelector(".when")); }
    state.textContent = m.status === "finished" ? "Full time" : "Live \\u00b7 " + (m.status_text || "");
    row.dataset.state = m.status;
  }
  // the match detail: the minute, and the goals and cards (substitutions would crowd the row), on the side of the team they belong to
  var told = {};
  function label(type) {
    var t = (type || "").toLowerCase();
    return /own/.test(t) ? "Own goal" : /pen/.test(t) ? "Penalty" : /red|second yellow/.test(t) ? "Red" : /yellow/.test(t) ? "Yellow" : /goal/.test(t) ? "Goal" : type;
  }
  function slugOf(url) { var p = (url || "").split("/").filter(Boolean); return p.length >= 4 ? p[2] + "-" + p[3] : null; }
  function detail(row, d) {
    if (d.live_minute && row.dataset.state === "live") row.querySelector(".state").textContent = "Live \u00b7 " + d.live_minute + "'";
    var list = row.querySelector(".events");
    if (!list) { list = document.createElement("ul"); list.className = "events"; row.insertBefore(list, row.querySelector(".when")); }
    list.textContent = "";
    var poster = row.classList.contains("feature");  // the poster keeps to goals and red cards
    (d.incidents || []).filter(function (e) { return e.is_goal || (e.is_card && (!poster || /red/i.test(e.type))); }).forEach(function (e) {
      var li = document.createElement("li");
      li.className = e.side === "away" ? "ev-away" : "ev-home";
      li.textContent = (e.time + "' " + label(e.type) + " " + (e.player || "")).trim();
      list.appendChild(li);
    });
  }
  function details(found) {
    return Promise.all(found.map(function (f) {
      var key = slugOf(f.m.url);
      if (!key || f.m.status === "upcoming" || (f.m.status === "finished" && told[key])) return null;
      told[key] = true;
      return window.fetch("https://sportscore.com/api/v1/match/?sport=football&slug=" + encodeURIComponent(key))
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (data) { if (data.match) f.rows.forEach(function (row) { detail(row, data.match); }); })
        .catch(function () {});
    }));
  }
  // the poster shows a game that is on: if its own game is not live and one in the lists is, it moves to that one
  function movePoster() {
    var poster = document.querySelector(".feature");
    var on = Array.prototype.find.call(document.querySelectorAll(".games [data-home]"), function (r) { return r.dataset.state === "live"; });
    if (!poster || !on || poster.dataset.state === "live" || poster.dataset.pinned) return;
    ["home", "away", "date", "state"].forEach(function (k) { poster.dataset[k] = on.dataset[k]; });
    [".home", ".mid", ".away", ".when"].forEach(function (k) { poster.querySelector(k).textContent = on.querySelector(k).textContent; });
    var ps = poster.querySelector(".state");
    if (!ps) { ps = document.createElement("span"); ps.className = "state"; poster.insertBefore(ps, poster.querySelector(".when")); }
    ps.textContent = on.querySelector(".state").textContent;
    var old = poster.querySelector(".events");
    if (old) old.remove();
  }
  function poll() {
    var mine = rows();
    if (!mine.length) return;
    var url = "https://sportscore.com/api/v1/fixtures/?sport=football&date=" + today() + "&competition=" + encodeURIComponent(league);
    window.fetch(url).then(function (r) { return r.ok ? r.json() : { matches: [] }; }).then(function (data) {
      var games = (data.matches || []).map(function (m) { return { m: m, home: teamId(m.home), away: teamId(m.away) }; });
      function hits(g) { return mine.filter(function (row) { return row.dataset.home === g.home && row.dataset.away === g.away; }); }
      games.forEach(function (g) { hits(g).forEach(function (row) { show(row, g.m); }); });
      movePoster();
      // matched again after the poster moved, so it gets the events of the game it shows now
      return details(games.map(function (g) { return { m: g.m, rows: hits(g) }; }).filter(function (f) { return f.rows.length; }));
    }).then(function () {
    }).catch(function () {}).then(function () {
      // keep asking while a game dated today or earlier is unfinished, or one is live; games days away have no score yet
      var open = mine.filter(function (r) { return r.dataset.state !== "finished" && r.dataset.date <= today(); });
      if (open.length || mine.some(function (r) { return r.dataset.state === "live"; })) setTimeout(poll, 60000);
    });
  }
  poll();
})();
`;
}

/** Write <out>/leagues/ from the API at <api>: index.html, site.css, live.js, fonts and <league>/index.html. All or nothing. */
export function pages({ api = "public/api/v1", out = "public" } = {}) {
  const { competitions } = JSON.parse(readFileSync(join(api, "competitions.json"), "utf8"));
  const byId = new Map(competitions.map((c) => [c.id, c]));
  const files = new Map([["site.css", CSS], ["live.js", liveScript()]]);
  for (const font of FONTS) files.set(`fonts/${font}`, readFileSync(join(HERE, "assets", "fonts", font)));
  const served = leagues().filter((l) => byId.has(l.id));
  served.forEach((league, i) => files.set(`${league.id}/index.html`, leaguePage(league, byId.get(league.id), api,
    served[(i - 1 + served.length) % served.length], served[(i + 1) % served.length])));
  files.set("index.html", shell({ title: "Leagues", path: "/leagues/", here: "all", description: "Tables, results and fixtures for eight European leagues.",
    body: `<header class="poster"><h1>golboard</h1><p class="note">Tables, results and fixtures, worked out from open data.</p></header>
<main class="board" style="grid-template-columns: minmax(0, 1fr)">
<ul class="list">${served.map((l) => `<li><a class="glass" href="/leagues/${l.id}/"><b>${esc(l.name)}</b><span>${esc(l.country)}</span></a></li>`).join("\n")}</ul>
</main>` }));
  const fresh = join(out, "leagues.next"), live = join(out, "leagues"), old = join(out, "leagues.old");
  rmSync(fresh, { recursive: true, force: true });
  for (const [path, body] of files) {
    mkdirSync(dirname(join(fresh, path)), { recursive: true });
    writeFileSync(join(fresh, path), body);
  }
  rmSync(old, { recursive: true, force: true });
  try { renameSync(live, old); } catch { /* first build */ }
  renameSync(fresh, live);
  rmSync(old, { recursive: true, force: true });
  return { pages: [...files.keys()].filter((p) => p.endsWith(".html")).length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const done = pages({ api: arg("api", join(root, "public/api/v1")), out: arg("out", join(root, "public")) });
  console.log(`pages: ${done.pages} pages`);
}
