// Does every team name the live feed uses map to a team on our pages? A name we do not know is a club whose live scores never show.
//   node scripts/api/check-live-names.mjs [--api public/api/v1] [--from 2026-10-30] [--to 2026-11-09] [--only it-1,fr-1]
// Reads SportScore's fixtures for each day of the window, for every league and tournament that has a `sportscore` name, one request
// every half second, and compares the names with the teams in the built API (run `npm run api` first). Prints each name it could not
// place with the id it made, and each team of ours the feed never named in the window (often the other half of the same mismatch).
// The fix for a mismatch is a line in data/api/aliases.json and a line in tests/api-league-live-names.test.ts. Exit code 1 when a name
// is unknown. Run it when a season starts (promoted clubs are the usual cause) and when a competition is added. Node only, no key.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { leagues, tournaments } from "./config.mjs";
import { teamId } from "./teams.mjs";

// No game of a hidden nation or its clubs is ever shown, so their names are not ours to place (data/api/tournaments.json `hide`).
export const HIDDEN = /\bisrael|\bmaccabi\b|\bhapoel\b|\bbeitar\b/i;

/** The feed's names that are not a team of ours: [{ name, id }]. `ours` is the API's teams ({ id: name }). */
export function unknownNames(names, ours, idOf = teamId, hidden = HIDDEN) {
  return [...new Set(names)].filter((name) => !hidden.test(name) && !(idOf(name) in ours)).map((name) => ({ name, id: idOf(name) }));
}

const days = (from, to) => {
  const out = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
  const api = arg("api", "public/api/v1");
  const today = new Date().toISOString().slice(0, 10);
  const window = days(arg("from", new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10)), arg("to", today));
  const only = arg("only", "").split(",").filter(Boolean);
  let wrong = 0;
  for (const c of [...leagues(), ...tournaments()]) {
    if (!c.sportscore || (only.length && !only.includes(c.id))) continue;
    const season = existsSync(join(api, c.id)) ? JSON.parse(readFileSync(join(api, "competitions.json"), "utf8")).competitions.find((x) => x.id === c.id)?.current ?? c.season : c.season;
    const path = join(api, c.id, season ?? "", "teams.json");
    if (!existsSync(path)) { console.log(`${c.id}: no built teams at ${path} (run npm run api)`); continue; }
    const ours = JSON.parse(readFileSync(path, "utf8")).teams;
    const names = [];
    let failed = 0;
    for (const date of window) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const reply = await fetch(`https://sportscore.com/api/v1/fixtures/?sport=football&date=${date}&competition=${c.sportscore}`);
        if (!reply.ok) { failed++; continue; }
        for (const m of (await reply.json()).matches ?? []) names.push(m.home, m.away);
      } catch { failed++; }
    }
    const unknown = unknownNames(names, ours);
    const seen = new Set(names.map((n) => teamId(n)));
    const silent = Object.keys(ours).filter((id) => !seen.has(id));
    wrong += unknown.length;
    console.log(`${c.id}: ${new Set(names).size} names in the feed, ${Object.keys(ours).length} teams of ours${failed ? `, ${failed} days could not be read` : ""}`
      + (unknown.length ? `\n  not ours: ${unknown.map((u) => `"${u.name}" (${u.id})`).join(", ")}` : "")
      + (unknown.length && silent.length ? `\n  ours the feed never named: ${silent.map((id) => `${ours[id]} (${id})`).join(", ")}` : ""));
  }
  console.log(wrong ? `${wrong} name(s) to add to data/api/aliases.json` : "every name in the feed is a team of ours");
  process.exit(wrong ? 1 : 0);
}
