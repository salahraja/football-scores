// One team, one id, whatever a source calls it ("SSC Napoli", "Napoli"; "FC Internazionale Milano", "Inter Milan"). The id is the name with
// accents, punctuation and club words taken off, as a slug; a few clubs whose names differ by more than that are in data/api/aliases.json.
// Node only, no dependencies.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Words that say "this is a club" rather than which club. Never words that tell two clubs apart (Real, Athletic, City, United, Sporting).
const CLUB_WORDS = new Set([
  "fc", "cf", "cfc", "afc", "ac", "as", "ss", "ssc", "us", "sc", "ssd", "sv", "vfl", "vfb", "tsg", "rcd", "cd", "ud", "sd", "rc", "ca", "fk", "bv",
  "bsc", "sk", "sad", "calcio", "club", "futbol", "football", "de", "del", "la", "1", "e", "v",
]);
let aliases;

export function slug(name) {
  const words = name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ")
    // Single letters are initials of club words ("S.L. Benfica", "F.C. Porto", "A.C. Milan"), never the club's name.
    .split(" ").filter((w) => w.length > 1 && !CLUB_WORDS.has(w) && !/^\d+$/.test(w));
  return words.join("-");
}

/** Our id for a team name from any source. */
export function teamId(name) {
  aliases ??= JSON.parse(readFileSync(join(ROOT, "data/api/aliases.json"), "utf8")).aliases;
  const s = slug(name);
  return aliases[s] ?? s;
}

/** A readable name: the source's own, with the club words off ("SSC Napoli" -> "Napoli"). */
export function shortName(name) {
  const kept = name.split(/\s+/).filter((w) => !CLUB_WORDS.has(w.toLowerCase().replace(/\./g, "")) && !/^\d+\.?$/.test(w));
  return kept.join(" ") || name;
}
