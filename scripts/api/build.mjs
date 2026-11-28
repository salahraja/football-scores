// golboard's API: a folder of static JSON built from saved source files (no server, and no key in any app).
//   node scripts/api/build.mjs [--input data/openfootball] [--wikipedia data/wikipedia] [--espn data/espn] [--out public] [--seasons 2025-26,2026-27]
// writes <out>/api/v1/competitions.json, <out>/api/v1/<league>/<season>/{matches,table,teams}.json and <out>/api/v1/meta.json;
// and for each tournament with a saved <wikipedia>/<season>/<id>.json, <out>/api/v1/tournaments.json and <out>/api/v1/<id>/<season>/{matches,groups,teams}.json.
// Every season is checked before anything is written; one failure and nothing is written, so the last good API stays up.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SITE, hiddenCountries, leagues, tournaments, loadAdjustments, loadCorrections, loadPostponed, loadZones, zoneNames } from "./config.mjs";
import { kickoff } from "./time.mjs";
import { applyCorrections, parseSeason } from "./openfootball.mjs";
import { computeTable } from "./table.mjs";
import { teamId } from "./teams.mjs";
import { teamCalendars } from "./calendar.mjs";
import { applyResults, parseNames, parseResults } from "./wikipedia.mjs";
import { parseLeaders } from "./leaders.mjs";
import { groupTables, nation, pageGames } from "./tournament.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OPENFOOTBALL = { name: "openfootball", url: "https://github.com/openfootball/football.json", licence: "CC0-1.0" };
const WIKIPEDIA = { name: "Wikipedia", url: "https://en.wikipedia.org/", licence: "CC-BY-SA-4.0" };
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

/** The season page's top scorers and clean sheets (leaders.mjs) with our team ids, or null. Never throws: these lists come from tables
 *  editors reshape, so a bad one is left out and the scores and tables still publish. A club with no team this season gets team null. */
export function leadersFile(stats, teams) {
  if (!stats?.text) return null;
  let lists;
  try { lists = parseLeaders(stats.text); } catch { return null; }
  if (!lists.goals && !lists.cleanSheets) return null;
  const ids = (list) => list && { asOf: list.asOf,
    rows: list.rows.map((r) => ({ rank: r.rank, player: r.player, club: r.club, team: teams[teamId(r.club)] ? teamId(r.club) : null, value: r.value })) };
  return { source: { ...WIKIPEDIA, url: `https://en.wikipedia.org/?oldid=${stats.revid}` }, goals: ids(lists.goals), cleanSheets: ids(lists.cleanSheets) };
}

/** The games fetch-espn.mjs saved for one league season, in file-name order; [] when there are none. */
function savedGames(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort().flatMap((f) => {
    try { return [JSON.parse(readFileSync(join(dir, f), "utf8"))]; } catch { return []; }
  });
}

/** A score Wikipedia's grid filled in that ESPN's saved game for the same two teams (within three days) contradicts is taken back: the
 *  game goes back to how openfootball has it (not played yet) until openfootball scores it. One mistyped cell (Juventus 0-10 Venezia on
 *  23 November 2026, a 4-0) must not reach the table. Returns the matches and the ids taken back. */
export function witness(merged, unmerged, dir) {
  const saved = savedGames(dir);
  const before = new Map(unmerged.map((m) => [m.id, m]));
  const overruled = [];
  const matches = merged.map((m) => {
    if (m.source !== "wikipedia" || !m.score) return m;
    const day = Date.parse(`${m.date}T00:00:00Z`);
    const g = saved.find((x) => teamId(x.home.name) === m.home && teamId(x.away.name) === m.away
      && Math.abs(Date.parse(`${x.kickoff.slice(0, 10)}T00:00:00Z`) - day) <= 3 * 86_400_000);
    if (!g || (g.home.score === m.score.ft[0] && g.away.score === m.score.ft[1])) return m;
    overruled.push(m.id);
    return before.get(m.id) ?? m;
  });
  return { matches, overruled };
}

/** Our games' detail from ESPN's feeds (fetch-espn.mjs saves one reduced file per game in `dir`): each paired with our own finished
 *  game by its two teams within three days (sources can be a day apart), with our team ids. A game whose score is not ours is left out
 *  and named in `disagree`; a team we cannot name is left out and named in `unknown`. Never throws. Null when `dir` has no games. */
export function gameFiles(dir, matches, teams, overruled = [], hidden = new Set()) {
  const saved = savedGames(dir);
  if (!saved.length) return null;
  const files = new Map(), report = { games: 0, unknown: [], disagree: [], overruled };
  for (const g of saved) {
    const home = teamId(g.home.name), away = teamId(g.away.name);
    if (hidden.has(home) || hidden.has(away)) continue;  // a hidden team's game is left out without a word (tournaments.json hide)
    const missing = [[home, g.home.name], [away, g.away.name]].filter(([id]) => !teams[id]).map(([, n]) => n);
    if (missing.length) { for (const n of missing) if (!report.unknown.includes(n)) report.unknown.push(n); continue; }
    const day = Date.parse(`${g.kickoff.slice(0, 10)}T00:00:00Z`);
    const ours = matches.find((m) => m.home === home && m.away === away && Math.abs(Date.parse(`${m.date}T00:00:00Z`) - day) <= 3 * 86_400_000);
    if (!ours || ours.status !== "finished") continue;  // not played yet in our data: paired once our result is in
    if (ours.score.ft[0] !== g.home.score || ours.score.ft[1] !== g.away.score) { report.disagree.push(g.espn); continue; }
    const { espn, kickoff, players, events, shots, positions, touches } = g;
    const stats = g.stats ?? null;  // ESPN's team stats; null for a game saved before they were kept, until the backfill reaches it
    files.set(`${ours.date}-${home}-${away}`, { match: ours.id, source: { name: "ESPN", url: `https://www.espn.com/soccer/match/_/gameId/${espn}` },
      kickoff, home: { team: home, formation: g.home.formation }, away: { team: away, formation: g.away.formation }, players, events, shots, positions, touches, stats });
    report.games += 1;
  }
  return { files, report };
}

/** A league season's players (fetch-squads.mjs saves one squad per club in `dir`) with our team ids, ordered by club then shirt number;
 *  a club we cannot name is left out. Null when `dir` has no squads. Never throws. */
export function playersFile(dir, teams) {
  if (!existsSync(dir)) return null;
  const seen = new Set(), players = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json") && !n.startsWith("_")).sort()) {
    let squad;
    try { squad = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch { continue; }
    const team = teamId(squad.team?.name ?? "");
    if (!teams[team]) continue;
    for (const p of squad.players ?? []) {
      if (!p.id || !p.name || seen.has(p.id)) continue;
      seen.add(p.id);
      players.push({ id: p.id, name: p.name, team, number: Number.isInteger(p.number) ? p.number : null, position: p.position ?? null });
    }
  }
  if (!players.length) return null;
  players.sort((a, b) => a.team.localeCompare(b.team) || (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name));
  return { source: { name: "ESPN", url: "https://www.espn.com/soccer/" }, players };
}

/** Every player's latest game with detail in one league season (from gameFiles' files): the game's page name, date and score line, and
 *  the player's touches, shots and goals in it. A player counts as having played after starting or coming on. */
export function latestByPlayer(files, matches, teams) {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const out = {};
  for (const [name, g] of [...files].sort((a, b) => a[0].localeCompare(b[0]))) {  // by date, so a later game overwrites
    const m = byId.get(g.match);
    if (!m?.score) continue;
    const title = `${teams[m.home]} ${m.score.ft[0]}–${m.score.ft[1]} ${teams[m.away]}`;
    const cameOn = new Set(g.events.filter((e) => e.kind === "sub" && e.player).map((e) => e.player));
    for (const p of g.players) {
      if (!p.starter && !cameOn.has(p.id)) continue;
      out[p.id] = { game: name, date: m.date, title, touches: (g.touches[p.id] ?? []).reduce((a, b) => a + b, 0),
        shots: g.shots.filter((s) => s.player === p.id).length, goals: g.events.filter((e) => (e.kind === "goal" || e.kind === "penalty") && e.player === p.id).length };
    }
  }
  return out;
}

/** Build everything in memory, check it, then write it all at once. Throws (writing nothing) when any season fails validation. */
export function build({ input = "data/openfootball", wikipedia = join(ROOT, "data/wikipedia"), espn = join(ROOT, "data/espn"), out = "public", seasons = ["2025-26", "2026-27"], now = new Date().toISOString(), mutate, zones = loadZones } = {}) {
  const files = new Map();
  const meta = { version: 1, generatedAt: now, sources: [OPENFOOTBALL], leagues: {} };
  // a game more than three days before the build with no result: its source has stalled (see api:check)
  const lateBefore = new Date(Date.parse(now) - 3 * 86_400_000).toISOString().slice(0, 10);
  const competitions = [];
  const problems = [];
  const current = new Map();  // league id -> its latest season's matches and team names, for today.json
  const names = zoneNames();
  let usedWikipedia = false;
  for (const league of leagues()) {
    const have = [];
    for (const season of seasons) {
      const path = join(input, season, `${league.openfootball}.json`);
      if (!existsSync(path)) continue;
      const parsed = parseSeason(JSON.parse(readFileSync(path, "utf8")), league.id);
      parsed.matches = applyCorrections(parsed.matches, loadCorrections(season, league.id));
      // Wikipedia's grid scores the games openfootball has not got to yet; it never overwrites a score openfootball has (wikipedia.mjs).
      const page = join(wikipedia, season, `${league.id}.json`);
      let wiki = null, stats = null, overruled = [];
      if (existsSync(page)) {
        const saved = JSON.parse(readFileSync(page, "utf8"));
        const merged = applyResults(parsed.matches, parseResults(saved.wikitext), parsed.teams, `https://en.wikipedia.org/?oldid=${saved.revid}`, now.slice(0, 10));
        const checked = witness(merged.matches, parsed.matches, join(espn, season, league.id));
        parsed.matches = checked.matches;
        overruled = checked.overruled;
        merged.filled -= overruled.length;
        wiki = { revision: saved.revid, filled: merged.filled, disagreements: merged.disagreements };
        // the short names fans use, where the grid has them (openfootball's "Espanyol Barcelona" reads like two teams)
        for (const { name, short } of parseNames(saved.wikitext)) if (parsed.teams[teamId(name)]) parsed.teams[teamId(name)] = short;
        stats = saved.stats ?? null;
        usedWikipedia = true;
      }
      mutate?.(parsed);
      problems.push(...validate(parsed, parsed.teams).map((p) => `${league.id} ${season}: ${p}`));
      const adjustments = loadAdjustments(season, league.id);
      const table = computeTable(parsed.matches, league, adjustments);
      for (const m of parsed.matches) m.kickoff = kickoff(m.date, m.time, league.tz);
      const zoning = zones(season, league.id);
      current.set(league.id, { matches: parsed.matches, teams: parsed.teams });
      const finished = parsed.matches.filter((m) => m.status === "finished");
      const postponed = loadPostponed(season, league.id);
      const base = `api/v1/${league.id}/${season}`;
      files.set(`${base}/matches.json`, { competition: league.id, season, matches: parsed.matches });
      files.set(`${base}/table.json`, { competition: league.id, season, table, adjustments,
        zones: zoning ? { zones: zoning.zones.map((z) => ({ kind: z.kind, label: names[z.kind], from: z.from, to: z.to })), note: zoning.note } : null });
      files.set(`${base}/teams.json`, { competition: league.id, season, teams: parsed.teams });
      const leaders = leadersFile(stats, parsed.teams);
      if (leaders) files.set(`${base}/leaders.json`, { competition: league.id, season, ...leaders });
      const squads = playersFile(join(espn, season, league.id, "squads"), parsed.teams);
      if (squads) files.set(`${base}/players.json`, { competition: league.id, season, ...squads });
      const games = gameFiles(join(espn, season, league.id), parsed.matches, parsed.teams, overruled);
      for (const [name, body] of games?.files ?? []) files.set(`${base}/games/${name}.json`, { competition: league.id, season, ...body });
      if (games?.files.size) files.set(`${base}/player-latest.json`, { competition: league.id, season, players: latestByPlayer(games.files, parsed.matches, parsed.teams) });
      // How far the source has got: the app says "results up to <date>" rather than pretending a stale table is live.
      meta.leagues[league.id] ??= {};
      meta.leagues[league.id][season] = { finished: finished.length, scheduled: parsed.matches.length - finished.length,
        lastResult: finished.reduce((d, m) => (m.date > d ? m.date : d), "") || null,
        corrections: parsed.matches.filter((m) => m.source === "correction").length,
        overdue: parsed.matches.filter((m) => m.status === "scheduled" && m.date < lateBefore && !postponed.has(m.id)).length, ...(wiki ? { wikipedia: wiki } : {}),
        ...(games ? { espn: games.report } : {}) };
      have.push(season);
    }
    if (have.length) competitions.push({ id: league.id, name: league.name, country: league.country, seasons: have, current: have.at(-1) });
  }
  // Tournaments (cups and international): separate from competitions.json, whose readers expect one league table per competition.
  const served = [];
  const hide = hiddenCountries();
  meta.tournaments = {};
  for (const t of tournaments()) {
    const path = join(wikipedia, t.season, `${t.id}.json`);
    if (!existsSync(path)) continue;
    const saved = JSON.parse(readFileSync(path, "utf8"));
    const games = [], names = {}, countries = {};
    for (const page of t.pages) {
      if (!saved.pages?.[page.title]) { problems.push(`${t.id} ${t.season}: no saved page "${page.title}"`); continue; }
      const read = pageGames(saved.pages[page.title].wikitext, page, t, now.slice(0, 10));
      games.push(...read.games);
      Object.assign(names, read.names);
      Object.assign(countries, read.countries);
    }
    // Hidden teams (tournaments.json `hide`): no row and no game of theirs, but the tables are worked out from every game first.
    const hidden = new Set(Object.keys(countries).filter((id) => hide.has(countries[id])));
    const shown = (m) => !hidden.has(m.home) && !hidden.has(m.away);
    const tables = groupTables(t, games).map(({ group, name, division, table }) => ({ group, name, division, table: table.filter((r) => !hidden.has(r.team)) }));
    const matches = games.filter(shown).map(({ name, division, ...m }) => m)
      .sort((a, b) => ((a.kickoff ? new Date(a.kickoff).toISOString() : a.date) + a.id).localeCompare((b.kickoff ? new Date(b.kickoff).toISOString() : b.date) + b.id));
    const teams = Object.fromEntries(Object.entries(names).filter(([id]) => !hidden.has(id)).sort((x, y) => x[0].localeCompare(y[0])));
    problems.push(...validate({ matches }, teams).map((p) => `${t.id} ${t.season}: ${p}`));
    const base = `api/v1/${t.id}/${t.season}`;
    files.set(`${base}/matches.json`, { tournament: t.id, season: t.season, matches });
    files.set(`${base}/groups.json`, { tournament: t.id, season: t.season,
      zones: (t.zones ?? []).map((z) => ({ kind: z.kind, label: z.label, from: z.from, to: z.to, division: z.division ?? null })),
      hosts: (t.hosts ?? []).map((c) => nation(c).id), groups: tables });
    files.set(`${base}/teams.json`, { tournament: t.id, season: t.season, teams });
    const detail = gameFiles(join(espn, t.season, t.id), matches, teams, [], hidden);
    for (const [name, body] of detail?.files ?? []) files.set(`${base}/games/${name}.json`, { competition: t.id, season: t.season, ...body });
    current.set(t.id, { matches, teams });  // today.json carries the cups' and internationals' games too, under the tournament's id
    const finished = matches.filter((m) => m.status === "finished");
    meta.tournaments[t.id] = { [t.season]: { finished: finished.length, scheduled: matches.length - finished.length,
      lastResult: finished.reduce((d, m) => (m.date > d ? m.date : d), "") || null,
      overdue: matches.filter((m) => m.status === "scheduled" && m.date < lateBefore).length,
      wikipedia: Object.fromEntries(t.pages.filter((p) => saved.pages?.[p.title]).map((p) => [p.title, saved.pages[p.title].revid])),
      ...(detail ? { espn: detail.report } : {}) } };
    served.push({ id: t.id, name: t.name, full: t.full, region: t.region, teams: t.teams, season: t.season, finals: t.finals });
    usedWikipedia = true;
  }
  files.set("api/v1/tournaments.json", { tournaments: served });
  if (usedWikipedia) meta.sources.push(WIKIPEDIA);
  if (problems.length) throw new Error(`validation failed, nothing written:\n${problems.slice(0, 20).join("\n")}`);
  files.set("api/v1/competitions.json", { competitions });
  // today.json: every league's and tournament's games from yesterday to three days ahead, with names, so a widget reads one small file
  const day0 = Date.parse(`${now.slice(0, 10)}T00:00:00Z`);
  const from = new Date(day0 - 86_400_000).toISOString().slice(0, 10), to = new Date(day0 + 3 * 86_400_000).toISOString().slice(0, 10);
  const around = [...current].flatMap(([league, { matches, teams }]) => matches.filter((m) => m.date >= from && m.date <= to)
    .map((m) => ({ league, ...m, homeName: teams[m.home], awayName: teams[m.away] })));
  // by the moment of kick-off: a tournament's kickoff carries the ground's UTC offset, so the strings alone would not sort
  const at = (m) => (m.kickoff ? new Date(m.kickoff).toISOString() : m.date);
  around.sort((a, b) => (at(a) + a.id).localeCompare(at(b) + b.id));
  files.set("api/v1/today.json", { generatedAt: now, from, to, matches: around });
  // The contract travels with the data, so a reader can check what it got against the shapes it was promised (tests/api-schema.test.ts).
  files.set("api/v1/schema.json", JSON.parse(readFileSync(join(ROOT, "data/api/schema.json"), "utf8")));
  // Every file's bytes and their sha256 in meta.json: a reader that finds a mismatch has a half-published or stale copy.
  const bytes = new Map([...files].map(([path, body]) => [path, JSON.stringify(body)]));
  // A calendar per team (calendar.mjs), from the same games as today.json: each league's latest season and each tournament.
  const titles = Object.fromEntries([...competitions.map((c) => [c.id, c.name]), ...served.map((t) => [t.id, t.name])]);
  for (const [path, text] of teamCalendars({ current, names: titles, now, site: SITE })) bytes.set(path, text);
  meta.files = Object.fromEntries([...bytes].map(([path, text]) => [path, createHash("sha256").update(text).digest("hex")]));
  bytes.set("api/v1/meta.json", JSON.stringify(meta));
  // Write beside the old API, then swap, so a reader never sees half of one build and half of another.
  const fresh = join(out, "api.next"), live = join(out, "api"), old = join(out, "api.old");
  rmSync(fresh, { recursive: true, force: true });
  for (const [path, text] of bytes) {
    const target = join(fresh, path.replace(/^api\//, ""));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  rmSync(old, { recursive: true, force: true });
  if (existsSync(live)) renameSync(live, old);
  renameSync(fresh, live);
  rmSync(old, { recursive: true, force: true });
  return { files: bytes.size, competitions: competitions.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const done = build({ input: arg("input", join(root, "data/openfootball")), wikipedia: arg("wikipedia", join(root, "data/wikipedia")), espn: arg("espn", join(root, "data/espn")), out: arg("out", join(root, "public")),
    seasons: arg("seasons", "2025-26,2026-27").split(",") });
  console.log(`api: ${done.files} files for ${done.competitions} competitions`);
}
