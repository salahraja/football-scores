// One club, one id, whatever a source calls it ("Inter", "Inter Milan", "Internazionale Milano"): the same rule as scripts/api/teams.mjs (the name with
// accents, punctuation and club words taken off, as a slug, then data/api/aliases.json), so a club on the homepage, whichever feed named it, is the club
// the Following star, the league pages and the news file mean.
import aliasFile from "../../data/api/aliases.json";

// Words that say "this is a club" rather than which club. Never words that tell two clubs apart (Real, Athletic, City, United, Sporting).
const CLUB_WORDS = new Set([
  "fc", "cf", "cfc", "afc", "ac", "as", "ss", "ssc", "us", "sc", "ssd", "sv", "vfl", "vfb", "tsg", "rcd", "cd", "ud", "sd", "rc", "ca", "fk", "bv",
  "bsc", "sk", "sad", "calcio", "club", "futbol", "football", "de", "del", "la", "1", "e", "v",
]);
const aliases = (aliasFile as { aliases: Record<string, string> }).aliases;

export function teamId(name: string): string {
  const slug = name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ")
    .split(" ").filter((w) => w.length > 1 && w !== "and" && !CLUB_WORDS.has(w) && !/^\d+$/.test(w))
    .join("-");
  return aliases[slug] ?? slug;
}
