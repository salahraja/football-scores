// Cups and international tournaments (data/api/tournaments.json), read from English Wikipedia pages (CC BY-SA 4.0). Each game is one
// match box, {{Football box ...}} or {{#invoke:Football box|main ...}}:
//   |date  = {{Start date|2026|9|29|df=y}}       the date
//   |time  = {{UTZ|15:00|2}}                      a local kick-off and its UTC offset (+2, 2, −1 with a minus sign, 0), or
//   |time  = 21:00 {{small|(20:00 UTC+1)}}         a kick-off in the tournament's own clock (tz in tournaments.json); empty until set
//   |team1 = {{fb-rt|LES}}                        a nation by FIFA code (data/api/nations.json), or
//   |team1 = [[AEK Athens F.C.|AEK Athens]] {{fbaicon|GRE}}   a club: the linked article is its id (teams.mjs), the link text its name
//   |score = 0–2                                  empty until played
// A page's "=== ... ===" headings say which group or matchday the boxes under them belong to. Node only, no dependencies.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeTable } from "./table.mjs";
import { slug, teamId } from "./teams.mjs";
import { kickoff as zoned } from "./time.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let nations;
const nationNames = () => (nations ??= JSON.parse(readFileSync(join(ROOT, "data/api/nations.json"), "utf8")).nations);

/** Our id and name for a FIFA code; throws on a code nations.json lacks. */
export function nation(code) {
  const name = nationNames()[code];
  if (!name) throw new Error(`tournament: no nation for code "${code}"; add it to data/api/nations.json`);
  return { id: slug(name), name };
}

const BOX = /\{\{\s*(?:#invoke:\s*)?Football box/g;
const FIELDS = ["date", "time", "team1", "score", "team2"];
const field = (block, name) => block.match(new RegExp(`\\|\\s*${name}\\s*=([^\\n]*)`))?.[1].trim() ?? "";

/** Each match box's text, up to its matching }}. */
function boxes(text) {
  const out = [];
  for (const m of text.matchAll(BOX)) {
    let depth = 0, j = m.index;
    while (j < text.length) {
      if (text.startsWith("{{", j)) { depth += 1; j += 2; continue; }
      if (text.startsWith("}}", j)) { depth -= 1; j += 2; if (depth === 0) break; continue; }
      j += 1;
    }
    out.push({ at: m.index, text: text.slice(m.index, j) });
  }
  return out;
}

/** What we keep of a page: its "=== ... ===" headings and each match box cut down to the fields we read, in page order. */
export function matchText(text) {
  const headings = [...text.matchAll(/^===\s*([^=\n]+?)\s*===\s*$/gm)].map((m) => ({ at: m.index, text: `===${m[1]}===` }));
  const cut = boxes(text).map((b) => ({ at: b.at, text: `{{Football box\n${FIELDS.map((f) => `|${f} = ${field(b.text, f)}`).join("\n")}\n}}` }));
  return cut.length ? [...headings, ...cut].sort((a, b) => a.at - b.at).map((x) => x.text).join("\n") : "";
}

const two = (n) => String(n).padStart(2, "0");

function side(value) {
  const code = value.match(/\{\{\s*fb(?:-rt)?\s*\|\s*([A-Z]{3})\s*\}\}/)?.[1];
  if (code) return { ...nation(code), country: code };
  const link = value.match(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/);
  if (link) return { id: teamId(link[1]), name: (link[2] ?? link[1]).trim(), country: value.match(/\{\{\s*fbaicon\s*\|\s*([A-Z]{3})/)?.[1] ?? null };
  throw new Error(`tournament: cannot read the team in "${value}"`);
}

/** The games on one saved page, with the teams' names and countries (a nation's FIFA code, a club's flag). `page` is its entry in tournaments.json. A score on a game dated `today` or later
 *  is not trusted: editors fill it in while the game is on. */
export function pageGames(wikitext, page, tournament, today) {
  const games = [], names = {}, countries = {};
  let heading = "";
  for (const part of wikitext.split(/\n(?===|\{\{\s*Football box)/)) {
    const h = part.match(/^===([^=]+)===/);
    if (h) { heading = h[1].trim(); continue; }
    if (!/^\{\{\s*Football box/.test(part)) continue;
    let group = page.group, name = page.name;
    if (page.groups === "headings") {
      const n = heading.match(/^Group (\w+)$/)?.[1];
      if (!n) continue;  // knockout games below the groups
      group = `${page.division}${n}`;
      name = `League ${page.division}, Group ${n}`;
    }
    const round = page.rounds === "headings" ? heading : name;
    const d = field(part, "date").match(/Start date\|(\d{4})\|(\d{1,2})\|(\d{1,2})/);
    if (!d) throw new Error(`tournament: a ${tournament.id} game in ${name} with no date`);
    const date = `${d[1]}-${two(d[2])}-${two(d[3])}`;
    const utz = field(part, "time").match(/UTZ\|(\d{1,2}):(\d{2})\|([+−-]?)(\d{1,2})(?::(\d{2}))?/);
    const plain = field(part, "time").match(/^(\d{1,2}):(\d{2})/);
    const time = utz ? `${two(utz[1])}:${utz[2]}` : plain ? `${two(plain[1])}:${plain[2]}` : null;
    const kickoff = utz ? `${date}T${time}:00${utz[3] === "−" || utz[3] === "-" ? "-" : "+"}${two(utz[4])}:${utz[5] ?? "00"}`
      : time && tournament.tz ? zoned(date, time, tournament.tz) : null;
    const home = side(field(part, "team1")), away = side(field(part, "team2"));
    for (const t of [home, away]) { names[t.id] = t.name; countries[t.id] = t.country; }
    const s = field(part, "score").replace(/<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>|\{\{[^{}]*\}\}/g, "").match(/^\s*(\d{1,2})\s*[–—−-]\s*(\d{1,2})\s*$/);  // en dash, em dash, minus sign or hyphen
    const played = Boolean(s) && date < today;
    games.push({ id: `${tournament.id}:${date}:${home.id}-${away.id}`, round, stage: "group", group, name, division: page.division ?? null, date, time, kickoff,
      home: home.id, away: away.id, status: played ? "finished" : "scheduled", score: played ? { ft: [Number(s[1]), Number(s[2])], ht: null } : null, source: "wikipedia" });
  }
  return { games, names, countries };
}

/** One table per group, in the order the groups first appear, each row with its status: the zone its place falls in, or "host" for a
 *  host nation (already in the finals). In a host's group the other teams' places are counted without the host, and each zone has one
 *  place fewer, so the group sends the host plus the best of the rest. */
export function groupTables(tournament, games) {
  const hosts = new Set((tournament.hosts ?? []).map((c) => nation(c).id));
  const order = [], byGroup = new Map();
  for (const g of games) {
    if (!byGroup.has(g.group)) { byGroup.set(g.group, []); order.push({ group: g.group, name: g.name, division: g.division }); }
    byGroup.get(g.group).push(g);
  }
  return order.map(({ group, name, division }) => {
    const zones = (tournament.zones ?? []).filter((z) => !z.division || z.division === division);
    const table = computeTable(byGroup.get(group), tournament);
    const inGroup = table.filter((r) => hosts.has(r.team)).length;
    let place = 0;
    return { group, name, division, table: table.map((r) => {
      if (hosts.has(r.team)) return { ...r, status: "host" };
      place += 1;
      const zone = zones.find((z) => place >= z.from && place <= z.to - inGroup);
      return { ...r, status: zone ? zone.kind : null };
    }) };
  });
}
