// Wikipedia's league season pages (CC BY-SA 4.0) into results for scripts/api/build.mjs. A page's results grid is a Lua module call,
// {{#invoke:Sports table|...}} on a current page or {{#invoke:sports results|...}} on a finished one, with one line per team and one per game:
//   |name_ATA=[[Atalanta BC|Atalanta]]      the code, and the club's article (the article title is the name we map to our team id)
//   |match_ATA_BOL= 1–0                      home code, away code, the score (en dash or hyphen; sometimes a link whose text is the score)
// A game not played yet is empty or not a score ("P–P", "a"), and is left out. Node only, no dependencies.
import { teamId } from "./teams.mjs";

const PARAM = /\|\s*(name|match)_([^\s_=|]+)(?:_([^\s=|]+))?\s*=([^\n]*)/g;

/** The club's name from a name_ line: the linked article's title ("Atalanta BC"), or the plain text if there is no link. */
function clubName(value) {
  const link = value.match(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/);
  return (link ? link[1] : value.replace(/\{\{[^}]*\}\}|<[^>]*>|'''?/g, "")).trim();
}

/** The score in a match_ line, or null: "2–1", "0-3", "3—1", "[[Alpha 4–1 Beta|4–1]]", "1–1<ref>..</ref>" and "0–0{{efn|..}}" are scores;
 *  "", "P–P", "{{abbr|P–P|Postponed}}" and "a" are not. */
function score(value) {
  // footnotes after the score go: <ref>s, and templates such as {{efn|Match abandoned ...}} (nested ones too)
  let text = value.replace(/<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>/g, "");
  while (/\{\{[^{}]*\}\}/.test(text)) text = text.replace(/\{\{[^{}]*\}\}/g, "");
  const link = text.match(/^\s*\[\[[^\]|]*\|([^\]]*)\]\]/);
  if (link) text = link[1];
  const m = text.match(/^\s*(\d{1,2})\s*[–—-]\s*(\d{1,2})\s*$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** [{ home, away, ft }] for every game in the grid with a score, home and away as the clubs' article titles. */
export function parseResults(wikitext) {
  const names = new Map();
  const games = [];
  for (const [, kind, a, b, value] of wikitext.matchAll(PARAM)) {
    if (kind === "name" && !b && !names.has(a)) names.set(a, clubName(value));
    if (kind === "match" && b) games.push([a, b, value]);
  }
  const out = [];
  for (const [h, a, value] of games) {
    const ft = score(value);
    if (!ft) continue;
    if (!names.has(h) || !names.has(a)) throw new Error(`wikipedia: a result for ${h}-${a} with no name line for ${names.has(h) ? a : h}`);
    out.push({ home: names.get(h), away: names.get(a), ft });
  }
  return out;
}

/** Fill in the league games openfootball has not scored. A score openfootball has is kept; where Wikipedia says otherwise it is reported,
 *  never overwritten (one vandalised cell must not change a table). A game dated `today` or later is left alone: editors update the grid
 *  while games are on, so its score may not be final. Throws on a club we cannot name, so it gets an alias, not a gap. */
export function applyResults(matches, results, teams, sourceUrl, today = null) {
  const byPair = new Map();
  for (const r of results) {
    const home = teamId(r.home), away = teamId(r.away);
    for (const [id, name] of [[home, r.home], [away, r.away]]) {
      if (!teams[id]) throw new Error(`wikipedia: no team "${id}" this season for "${name}"; add it to data/api/aliases.json`);
    }
    byPair.set(`${home}|${away}`, r.ft);
  }
  let filled = 0;
  const disagreements = [];
  const out = matches.map((m) => {
    const ft = m.stage === "league" ? byPair.get(`${m.home}|${m.away}`) : undefined;
    if (!ft || (today && m.date >= today)) return m;
    if (m.status === "finished") {
      if (JSON.stringify(m.score.ft) !== JSON.stringify(ft)) disagreements.push({ match: m.id, openfootball: m.score.ft, wikipedia: ft });
      return m;
    }
    filled += 1;
    return { ...m, status: "finished", score: { ft, ht: null }, source: "wikipedia", sourceUrl };
  });
  return { matches: out, filled, disagreements };
}
