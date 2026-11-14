// International tournaments played in groups (data/api/tournaments.json), read from the English Wikipedia group pages (CC BY-SA 4.0).
// Each game is one {{Football box}}:
//   |date  = {{Start date|2026|9|29|df=y}}     the local date
//   |time  = {{UTZ|15:00|2}}                    the local kick-off and its UTC offset (+2, 2, −1 with a minus sign, 0); empty until set
//   |team1 = {{fb-rt|LES}}  |team2 = {{fb|MAR}} home and away, by FIFA code (data/api/nations.json)
//   |score = 0–2                                empty until played
// Node only, no dependencies.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeTable } from "./table.mjs";
import { slug } from "./teams.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let nations;
const nationNames = () => (nations ??= JSON.parse(readFileSync(join(ROOT, "data/api/nations.json"), "utf8")).nations);

/** Our id and name for a FIFA code; throws on a code nations.json lacks. */
export function nation(code) {
  const name = nationNames()[code];
  if (!name) throw new Error(`tournament: no nation for code "${code}"; add it to data/api/nations.json`);
  return { id: slug(name), name };
}

/** Every {{Football box ...}} on a page, each up to its matching }}, joined by newlines. */
export function footballBoxes(text) {
  const out = [];
  for (const m of text.matchAll(/\{\{\s*Football box/g)) {
    let depth = 0, j = m.index;
    while (j < text.length) {
      if (text.startsWith("{{", j)) { depth += 1; j += 2; continue; }
      if (text.startsWith("}}", j)) { depth -= 1; j += 2; if (depth === 0) break; continue; }
      j += 1;
    }
    out.push(text.slice(m.index, j));
  }
  return out.join("\n");
}

const field = (block, name) => block.match(new RegExp(`\\|\\s*${name}\\s*=([^\\n]*)`))?.[1].trim() ?? "";
const two = (n) => String(n).padStart(2, "0");

/** The games in one group's boxes. A score on a game dated `today` or later is not trusted (editors fill it in while it is on). */
export function parseBoxes(wikitext, group, today) {
  return footballBoxes(wikitext).split(/\n(?=\{\{\s*Football box)/).filter(Boolean).map((block) => {
    const d = field(block, "date").match(/Start date\|(\d{4})\|(\d{1,2})\|(\d{1,2})/);
    if (!d) throw new Error(`tournament: a Group ${group} game with no date`);
    const date = `${d[1]}-${two(d[2])}-${two(d[3])}`;
    const t = field(block, "time").match(/UTZ\|(\d{1,2}):(\d{2})\|([+−-]?)(\d{1,2})(?::(\d{2}))?/);
    const time = t ? `${two(t[1])}:${t[2]}` : null;
    const kickoff = t ? `${date}T${time}:00${t[3] === "−" || t[3] === "-" ? "-" : "+"}${two(t[4])}:${t[5] ?? "00"}` : null;
    const code = (name) => field(block, name).match(/\{\{\s*fb(?:-rt)?\s*\|\s*([A-Z]{3})/)?.[1] ?? field(block, name);
    const home = nation(code("team1")), away = nation(code("team2"));
    const s = field(block, "score").replace(/<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>|\{\{[^{}]*\}\}/g, "").match(/^\s*(\d{1,2})\s*[–—-]\s*(\d{1,2})\s*$/);
    const played = Boolean(s) && date < today;
    return { id: `afcon:${date}:${home.id}-${away.id}`, round: `Group ${group}`, stage: "group", group, date, time, kickoff, home: home.id, away: away.id,
      status: played ? "finished" : "scheduled", score: played ? { ft: [Number(s[1]), Number(s[2])], ht: null } : null, source: "wikipedia" };
  });
}

/** One table per group, worked out from its results with the tournament's rules. Each row's status says who is in line to go through:
 *  "qualify" for the top places, "host" for a host (already in the finals); a host's group sends the host plus the best of the rest. */
export function groupTables(tournament, byGroup) {
  const hosts = new Set((tournament.hosts ?? []).map((c) => nation(c).id));
  return tournament.groups.map((group) => {
    const table = computeTable(byGroup[group] ?? [], tournament);
    let left = tournament.qualify - table.filter((r) => hosts.has(r.team)).length;
    return { group, table: table.map((r) => ({ ...r, status: hosts.has(r.team) ? "host" : left-- > 0 ? "qualify" : null })) };
  });
}
