// Football headlines from the publishers' own RSS feeds (BBC Sport, The Guardian, ESPN), tagged with the clubs they are about, published as
// api/v1/news.json. Only the headline, a short plain-text summary, a picture address and the link are kept: a story is read on the
// publisher's own site. (The Guardian offers its feeds for personal, non-commercial use; BBC's and ESPN's current terms were not confirmed.)
//   node scripts/api/news.mjs fetch   download the feeds into data/news (a feed that fails keeps its saved copy)
//   node scripts/api/news.mjs build   data/news -> <api>/news.json; never fails, so the pages after it are still built
// The club matching is the iPhone app's (Golboard/Follow.swift), rule for rule; tests/api-news.test.ts holds the same cases.
// Node only, no dependencies.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const FEEDS = [
  { name: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/football/rss.xml" },
  { name: "The Guardian", url: "https://www.theguardian.com/football/rss" },
  { name: "ESPN", url: "https://www.espn.com/espn/rss/soccer/news" },
];
const AGENT = "golboard-news (personal football pages)";
const LIMIT = 60;

// ---- reading a feed

const NAMED = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " };
/** The entities that show up in headlines: the named few and numeric ones such as &#8217;. "&amp;" last, so "&amp;lt;" stays "&lt;". */
export function unescapeEntities(text) {
  let out = text;
  for (const [entity, char] of Object.entries(NAMED)) out = out.split(entity).join(char);
  out = out.replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (m, code) => {
    const n = /^x/i.test(code) ? parseInt(code.slice(1), 16) : parseInt(code, 10);
    return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
  });
  return out.split("&amp;").join("&");
}

/** Plain text from a description that may carry HTML: tags dropped, entities decoded, "Continue reading..." removed, cut to 160 characters. */
export function plain(html) {
  const text = unescapeEntities(html.replace(/<[^>]*>/g, " ")).replace("Continue reading...", "").replace(/\s+/g, " ").trim();
  if (text.length <= 160) return text;
  const cut = text.slice(0, 160);
  const at = cut.lastIndexOf(" ");
  return `${at >= 0 ? cut.slice(0, at) : cut}…`;
}

/** The text of an element: CDATA as it is, anything else with its XML entities decoded once. */
function text(block, name) {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  if (!m) return null;
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(m[1]);
  return (cdata ? cdata[1] : unescapeEntities(m[1])).trim();
}

/** The articles of an RSS 2.0 feed: [{ title, summary, url, source, published (ISO), image, tags }]. An item with no title, web link or date is skipped. */
export function parseRss(xml, source) {
  const out = [];
  for (const item of String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = item[1];
    const title = unescapeEntities(text(block, "title") ?? "");
    const url = text(block, "link") ?? "";
    const published = Date.parse(text(block, "pubDate") ?? text(block, "dc:date") ?? "");
    if (!title || !/^https?:\/\//i.test(url) || Number.isNaN(published)) continue;
    let image = null, widest = -1;
    for (const m of block.matchAll(/<media:(?:thumbnail|content)\b([^>]*)>/gi)) {
      const src = /\burl="(https:\/\/[^"]+)"/i.exec(m[1])?.[1];
      const width = Number(/\bwidth="(\d+)"/i.exec(m[1])?.[1] ?? 0);
      if (src && width > widest) { image = unescapeEntities(src); widest = width; }
    }
    const tags = [...block.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)].map((m) => {
      const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(m[1]);
      return unescapeEntities((cdata ? cdata[1] : unescapeEntities(m[1])).trim());
    });
    const description = text(block, "description");
    const summary = description ? plain(description) : "";
    out.push({ title, summary: summary || null, url, source, published: new Date(published).toISOString(), image, tags });
  }
  return out;
}

// ---- which clubs a headline is about

/** Lowercase, accents folded, anything that is not a plain letter or digit turned into a single space. */
export const normalize = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const words = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean);

/** Words that name a kind of club, not one club. */
const GENERIC = new Set(["fc", "afc", "cf", "ac", "as", "ss", "sc", "sv", "fsv", "vfb", "vfl", "tsg", "rcd", "rc", "cd", "ud", "sd",
  "real", "club", "calcio", "united", "city", "town", "albion", "hotspur", "wanderers", "athletic", "rovers", "county", "hove", "and", "de", "the"]);
/** What the press calls a club besides its listed name. */
const ALIASES = {
  "manchester-united": ["Man United", "Man Utd"], "manchester-city": ["Man City"], "tottenham-hotspur": ["Spurs"], "wolverhampton-wanderers": ["Wolves"],
  "aston-villa": ["Villa"], "atletico-madrid": ["Atletico", "Atleti"], inter: ["Internazionale"], milan: ["Milan"], barcelona: ["Barca"],
  "bayern-munich": ["Bayern"], "borussia-dortmund": ["Dortmund"], "borussia-monchengladbach": ["Gladbach"], "paris-saint-germain": ["PSG"], juventus: ["Juve"],
};
/** Phrases that hide a club's short name: "Milan" means AC Milan except inside "Inter Milan". */
const APART = { milan: ["Inter Milan"] };

const stem = (normalized) => normalized.split(" ").filter((w) => w && !GENERIC.has(w) && !/^\d+$/.test(w)).join(" ");
const containsWords = (haystack, phrase) => ` ${haystack} `.includes(` ${phrase} `);

/** For each club ({ id, name }), what to look for: { phrases, without }. A short form that could mean two clubs is left out, so a story may be
 *  missed but is not filed under the wrong club. */
export function clubTerms(clubs) {
  const fulls = new Map(clubs.map((c) => [c.id, normalize(c.name)]));
  const extras = new Map(clubs.map((c) => [c.id, (ALIASES[c.id] ?? []).map(normalize)]));
  const stems = new Map([...fulls].map(([id, full]) => [id, stem(full)]));
  const out = new Map();
  for (const c of clubs) {
    const full = fulls.get(c.id), own = stems.get(c.id);
    const others = clubs.filter((o) => o.id !== c.id).flatMap((o) => [fulls.get(o.id), stems.get(o.id), ...extras.get(o.id)]);
    const phrases = [];
    // a one-word name that is also a word of another club's name ("Paris", next to Paris Saint-Germain) could mean either
    if (full.includes(" ") || !others.some((o) => o !== full && containsWords(o, full))) phrases.push(full);
    phrases.push(...extras.get(c.id));
    if (own.length >= 4 && own !== full && !phrases.includes(own) && !others.some((o) => o === own || containsWords(o, own))) phrases.push(own);
    out.set(c.id, { phrases, without: (APART[c.id] ?? []).map(normalize) });
  }
  return out;
}

const startsOf = (phrase, list) => {
  const found = [];
  for (let i = 0; i + phrase.length <= list.length; i++) if (phrase.every((w, k) => list[i + k] === w)) found.push(i);
  return found;
};

/** True when a phrase of `terms` appears as whole words in the headline, summary or tags. A one-word phrase must start with a capital there,
 *  so "nice" the word is not Nice the club. */
export function mentions(article, terms) {
  const cased = words([article.title, article.summary ?? "", ...(article.tags ?? [])].join(" "));
  const lower = cased.map((w) => w.toLowerCase());
  const hidden = new Set();
  for (const phrase of terms.without) {
    const p = phrase.split(" ");
    for (const s of startsOf(p, lower)) for (let k = 0; k < p.length; k++) hidden.add(s + k);
  }
  for (const phrase of terms.phrases) {
    const p = phrase.split(" ");
    for (const s of startsOf(p, lower)) if (!hidden.has(s) && (p.length > 1 || /^[A-Z]/.test(cased[s]))) return true;
  }
  return false;
}

// ---- putting the feeds together

/** The address without tracking parameters, so one story reached by two routes counts once. */
function storyId(url) {
  try { const u = new URL(url); u.search = ""; u.hash = ""; return u.href; } catch { return url; }
}

/** Newest first, one entry per story, at most LIMIT. */
export function merge(lists, limit = LIMIT) {
  const seen = new Set();
  return lists.flat().sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
    .filter((a) => { const id = storyId(a.url); return seen.has(id) ? false : (seen.add(id), true); }).slice(0, limit);
}

/** Download each feed into <raw>/<name>.xml. A feed that does not answer, or answers with something that is not a feed, keeps its saved copy. */
export async function fetchFeeds({ raw = join(ROOT, "data/news"), fetch = globalThis.fetch } = {}) {
  mkdirSync(raw, { recursive: true });
  const saved = [], kept = [];
  await Promise.all(FEEDS.map(async (feed) => {
    try {
      const res = await fetch(feed.url, { headers: { "User-Agent": AGENT }, signal: AbortSignal.timeout(15_000) });
      const body = res.ok ? await res.text() : "";
      if (!parseRss(body, feed.name).length) throw new Error("no items");
      writeFileSync(join(raw, `${slugOf(feed.name)}.xml`), body);
      saved.push(feed.name);
    } catch {
      kept.push(feed.name);
    }
  }));
  const order = FEEDS.map((f) => f.name);
  return { saved: saved.sort((a, b) => order.indexOf(a) - order.indexOf(b)), kept: kept.sort((a, b) => order.indexOf(a) - order.indexOf(b)) };
}

/** Write <api>/news.json from the saved feeds. Never throws: whatever goes wrong, the file holds the stories that could be read (or none). */
export function buildNews({ api = join(ROOT, "public/api/v1"), raw = join(ROOT, "data/news"), now = new Date().toISOString() } = {}) {
  let articles = [];
  try {
    const lists = FEEDS.map((feed) => {
      try { return parseRss(readFileSync(join(raw, `${slugOf(feed.name)}.xml`), "utf8"), feed.name); } catch { return []; }
    });
    const clubs = [];
    const { competitions } = JSON.parse(readFileSync(join(api, "competitions.json"), "utf8"));
    for (const c of competitions) {
      const { teams } = JSON.parse(readFileSync(join(api, c.id, c.current, "teams.json"), "utf8"));
      for (const [id, name] of Object.entries(teams)) clubs.push({ id, name });
    }
    const terms = clubTerms(clubs);
    articles = merge(lists).map(({ tags, ...a }) => ({ ...a, clubs: clubs.filter((c) => mentions({ ...a, tags }, terms.get(c.id))).map((c) => c.id) }));
  } catch (error) {
    console.warn(`news: ${error.message}; writing what could be read`);
  }
  const file = join(api, "news.json");
  mkdirSync(api, { recursive: true });
  writeFileSync(`${file}.tmp`, `${JSON.stringify({ generatedAt: now, articles }, null, 1)}\n`);
  renameSync(`${file}.tmp`, file);
  return { articles: articles.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const mode = process.argv[2];
  if (mode === "fetch") {
    const done = await fetchFeeds();
    console.log(`news: saved ${done.saved.join(", ") || "none"}${done.kept.length ? `; kept the saved copy of ${done.kept.join(", ")}` : ""}`);
  } else if (mode === "build") {
    console.log(`news: ${buildNews().articles} stories`);
  } else {
    console.error("usage: node scripts/api/news.mjs fetch|build");
    process.exit(2);
  }
}
