// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv/dist/2020";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { FEEDS, buildNews, clubTerms, fetchClubFeeds, fetchFeeds, guardianFeeds, mentions, merge, parseRss, plain } from "../scripts/api/news.mjs";

// Football headlines from the publishers' own RSS feeds, tagged with the clubs they mention, published as api/v1/news.json. The samples are
// trimmed from the real feeds fetched on 2026-11-12. The same matching rules and the same cases as the iPhone app's (Golboard/Follow.swift).
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-news-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

const BBC = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<title><![CDATA[BBC Sport]]></title><link>https://www.bbc.co.uk/sport/football</link>
<item><title><![CDATA[How Pochettino came on Man Utd's radar]]></title>
<description><![CDATA[How Man Utd identified Mauricio Pochettino as their new head coach.]]></description>
<link>https://www.bbc.co.uk/sport/football/articles/cqdr1jlr1707o?at_medium=RSS&amp;at_campaign=rss</link>
<pubDate>Thu, 12 Nov 2026 16:12:39 GMT</pubDate>
<media:thumbnail width="240" height="135" url="https://ichef.bbci.co.uk/ace/standard/240/a.jpg"/></item></channel></rss>`;
const ESPN = `<rss version="2.0"><channel><title><![CDATA[www.espn.com - SOCCER]]></title><link>https://www.espn.com</link>
<item><title><![CDATA[Man United sack Carrick]]></title><description><![CDATA[The club confirmed Thursday.]]></description>
<link><![CDATA[https://www.espn.com/soccer/story/_/id/50180844/man-united-michael-carrick-sacked-pochettino]]></link>
<pubDate>Thu, 12 Nov 2026 14:01:46 EST</pubDate></item></channel></rss>`;
const GUARDIAN = `<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Football | The Guardian</title>
<item><title>Kane sets cap record &amp; more</title><link>https://www.theguardian.com/football/2026/nov/12/harry-kane-wins-record-126th-england-cap</link>
<description>&lt;p&gt;Harry Kane has won his 126th cap &amp;amp; broken the record.&lt;/p&gt; &lt;a href="https://x.test/a"&gt;Continue reading...&lt;/a&gt;</description>
<category domain="d">Tottenham Hotspur</category><category domain="d">Football</category>
<pubDate>Thu, 12 Nov 2026 18:30:00 GMT</pubDate>
<media:content width="140" url="https://i.guim.co.uk/img/small.jpg"/><media:content width="460" url="https://i.guim.co.uk/img/big.jpg"/></item></channel></rss>`;

describe("reading a feed", () => {
  it("reads an item and not the channel above it", () => {
    const [a] = parseRss(BBC, "BBC Sport");
    expect(a).toMatchObject({
      title: "How Pochettino came on Man Utd's radar", summary: "How Man Utd identified Mauricio Pochettino as their new head coach.",
      url: "https://www.bbc.co.uk/sport/football/articles/cqdr1jlr1707o?at_medium=RSS&at_campaign=rss", source: "BBC Sport",
      image: "https://ichef.bbci.co.uk/ace/standard/240/a.jpg", published: "2026-11-12T16:12:39.000Z",
    });
  });

  it("reads a time zone named in letters, like EST", () => {
    expect(parseRss(ESPN, "ESPN")[0].published).toBe("2026-11-12T19:01:46.000Z");
  });

  it("makes short plain text of an HTML description, takes the widest picture, and keeps the feed's own tags", () => {
    const [a] = parseRss(GUARDIAN, "The Guardian");
    expect(a.title).toBe("Kane sets cap record & more");
    expect(a.summary).toBe("Harry Kane has won his 126th cap & broken the record.");
    expect(a.image).toBe("https://i.guim.co.uk/img/big.jpg");
    expect(a.tags).toEqual(["Tottenham Hotspur", "Football"]);
    expect(plain(`<p>${"word ".repeat(80)}</p>`).length).toBeLessThanOrEqual(161);
  });

  it("skips items with no title, no web link or no date", () => {
    const xml = `<rss><channel><item><title>No link</title></item><item><link>https://a.test/x</link></item>
<item><title>Mail</title><link>mailto:a@b.test</link><pubDate>Thu, 12 Nov 2026 10:00:00 GMT</pubDate></item>
<item><title>No date</title><link>https://a.test/z</link></item>
<item><title>Fine</title><link>https://a.test/y</link><pubDate>Thu, 12 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
    expect(parseRss(xml, "S").map((a: { title: string }) => a.title)).toEqual(["Fine"]);
  });

  it("returns nothing for a page that is not a feed", () => {
    expect(parseRss("<html><body>oops", "S")).toEqual([]);
    expect(parseRss("", "S")).toEqual([]);
  });
});

const CLUBS = [
  ["manchester-united", "Manchester United"], ["manchester-city", "Manchester City"], ["newcastle-united", "Newcastle United"],
  ["leeds-united", "Leeds United"], ["tottenham-hotspur", "Tottenham Hotspur"], ["aston-villa", "Aston Villa"],
  ["brighton-hove-albion", "Brighton & Hove Albion"], ["arsenal", "Arsenal"], ["inter", "Inter Milan"], ["milan", "AC Milan"],
  ["villarreal", "Villarreal"], ["atletico-madrid", "Atlético Madrid"], ["real-madrid", "Real Madrid"], ["nice", "Nice"],
  ["paris", "Paris FC"], ["paris-saint-germain", "Paris Saint-Germain"],
].map(([id, name]) => ({ id, name }));
const terms = clubTerms(CLUBS);
const hits = (title: string, extra: { summary?: string; tags?: string[] } = {}) =>
  CLUBS.map((c) => c.id).filter((id) => mentions({ title, summary: extra.summary ?? null, tags: extra.tags ?? [] }, terms.get(id)!)).sort();

describe("which clubs a headline is about", () => {
  it("finds a club by its name and its short names", () => {
    expect(hits("Man Utd sack Carrick")).toEqual(["manchester-united"]);
    expect(hits("Manchester United's new boss")).toEqual(["manchester-united"]);
    expect(hits("Man City win at Anfield")).toEqual(["manchester-city"]);
    expect(hits("Spurs sign a striker")).toEqual(["tottenham-hotspur"]);
    expect(hits("Newcastle beat Brighton")).toEqual(["brighton-hove-albion", "newcastle-united"]);
    expect(hits("Villa and Leeds drawn together")).toEqual(["aston-villa", "leeds-united"]);
    expect(hits("Atlético boss on Real")).toEqual(["atletico-madrid"]);
  });

  it("finds neither club when a word belongs to two", () => {
    expect(hits("United fans protest")).toEqual([]);
    expect(hits("Manchester derby preview")).toEqual([]);
    expect(hits("Madrid derby")).toEqual([]);
  });

  it("does not take a name from inside another word or club", () => {
    expect(hits("Villarreal win")).toEqual(["villarreal"]);
    expect(hits("Inter Miami sign a winger")).toEqual([]);
    expect(hits("Inter Milan beat AC Milan")).toEqual(["inter", "milan"]);
    expect(hits("Amorim's Milan surge puts rivals on notice")).toEqual(["milan"]);
    expect(hits("Inter Milan win at home")).toEqual(["inter"]);
  });

  it("needs a capital for a one-word name, so ordinary words are not hits", () => {
    expect(hits("That was a nice win for Arsenal")).toEqual(["arsenal"]);
    expect(hits("Nice beat Lyon at home")).toEqual(["nice"]);
    expect(hits("Balogun leaves Monaco for Paris")).toEqual([]);
    expect(hits("Paris Saint-Germain win again")).toEqual(["paris-saint-germain"]);
    expect(hits("PSG win again")).toEqual(["paris-saint-germain"]);
  });

  it("counts the summary and the feed's own tags", () => {
    expect(hits("Late drama at Old Trafford", { summary: "Arsenal take all three points" })).toEqual(["arsenal"]);
    expect(hits("Tuchel names his squad", { tags: ["Football", "Tottenham Hotspur"] })).toEqual(["tottenham-hotspur"]);
  });
});

const art = (title: string, url: string, published: string) => ({ title, summary: null, url, source: "S", published, image: null, tags: [] });

describe("putting the feeds together", () => {
  it("lists the newest first and a story reached by two routes once", () => {
    const a = art("a", "https://x.test/1?at_medium=RSS", "2026-11-12T10:00:00.000Z");
    const b = art("b", "https://x.test/2", "2026-11-12T11:00:00.000Z");
    const aAgain = art("a again", "https://x.test/1", "2026-11-12T10:00:00.000Z");
    expect(merge([[a], [b, aAgain]]).map((x: { title: string }) => x.title)).toEqual(["b", "a"]);
  });

  it("keeps at most sixty", () => {
    const many = Array.from({ length: 80 }, (_, i) => art(`t${i}`, `https://x.test/${i}`, new Date(Date.UTC(2026, 10, 12, 12, 0) - i * 60000).toISOString()));
    const merged = merge([many]);
    expect(merged).toHaveLength(60);
    expect(merged[0].title).toBe("t0");
  });
});

describe("the news file", () => {
  const api = () => {
    const out = tmp();
    build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), out, seasons: ["2025-26"], now: "2026-10-31T17:00:00Z" });
    return join(out, "api/v1");
  };
  const raw = (files: Record<string, string>) => {
    const dir = tmp();
    for (const [name, xml] of Object.entries(files)) writeFileSync(join(dir, name), xml);
    return dir;
  };
  const read = (dir: string) => JSON.parse(readFileSync(join(dir, "news.json"), "utf8"));

  it("is written beside the API's other files, newest first, each story tagged with the club ids of this API", () => {
    const dir = api();
    const NAPOLI = `<rss><channel><item><title>Napoli sign a defender</title><link>https://a.test/n</link><pubDate>Fri, 13 Nov 2026 09:00:00 GMT</pubDate></item></channel></rss>`;
    buildNews({ api: dir, raw: raw({ "bbc-sport.xml": BBC, "espn.xml": ESPN, "the-guardian.xml": NAPOLI }), now: "2026-11-13T10:00:00Z" });
    const news = read(dir);
    expect(news.generatedAt).toBe("2026-11-13T10:00:00Z");
    expect(news.articles.map((a: { title: string }) => a.title)).toEqual(["Napoli sign a defender", "Man United sack Carrick", "How Pochettino came on Man Utd's radar"]);
    expect(news.articles[0].clubs).toEqual(["napoli"]);
    expect(news.articles[0].tags).toBeUndefined();
    const schema = JSON.parse(readFileSync("data/api/schema.json", "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
    ajv.addSchema(schema);
    expect(ajv.validate(`${schema.$id}#/$defs/news`, news), JSON.stringify(ajv.errors)).toBe(true);
  });

  it("never fails the build: a missing or broken feed gives the others, and no feeds gives an empty list", () => {
    const dir = api();
    buildNews({ api: dir, raw: raw({ "bbc-sport.xml": BBC, "espn.xml": "<html>not a feed" }), now: "2026-11-13T10:00:00Z" });
    expect(read(dir).articles).toHaveLength(1);
    buildNews({ api: dir, raw: join(tmp(), "nothing-here"), now: "2026-11-13T10:00:00Z" });
    expect(read(dir).articles).toEqual([]);
  });

  it("is not listed in meta.json, which describes only the files build.mjs wrote", () => {
    const dir = api();
    buildNews({ api: dir, raw: raw({ "bbc-sport.xml": BBC }), now: "2026-11-13T10:00:00Z" });
    expect(JSON.stringify(JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")))).not.toContain("news.json");
  });
});

describe("fetching the feeds", () => {
  const reply = (body: string, status = 200) => async () => new Response(body, { status });

  it("saves each feed that answers and keeps the saved copy of one that does not", async () => {
    const dir = tmp();
    writeFileSync(join(dir, "espn.xml"), ESPN);
    const seen: string[] = [];
    const fetchStub = async (url: string, init: { headers: Record<string, string> }) => {
      seen.push(`${url}|${init.headers["User-Agent"]}`);
      return url.includes("bbci") ? new Response(BBC) : new Response("down", { status: 503 });
    };
    const done = await fetchFeeds({ raw: dir, fetch: fetchStub });
    expect(done).toEqual({ saved: ["BBC Sport"], kept: ["The Guardian", "ESPN"] });
    expect(readFileSync(join(dir, "bbc-sport.xml"), "utf8")).toBe(BBC);
    expect(readFileSync(join(dir, "espn.xml"), "utf8")).toBe(ESPN);
    expect(existsSync(join(dir, "the-guardian.xml"))).toBe(false);
    expect(seen).toHaveLength(FEEDS.length);
    expect(seen.every((s) => s.endsWith("|golboard-news (personal football pages)"))).toBe(true);
  });

  it("does not throw when the network is down", async () => {
    const done = await fetchFeeds({ raw: tmp(), fetch: async () => { throw new Error("offline"); } });
    expect(done.saved).toEqual([]);
  });

  it("ignores an answer that is not a feed", async () => {
    const dir = tmp();
    const done = await fetchFeeds({ raw: dir, fetch: reply("<html>captive portal") });
    expect(done.saved).toEqual([]);
    expect(existsSync(join(dir, "bbc-sport.xml"))).toBe(false);
  });
});

// A club you follow needs its own stream: the three general feeds carry the big English stories (none of 60 on 12 November named Juventus). The Guardian
// publishes a feed per club (theguardian.com/football/<tag>/rss); data/api/guardian-feeds.json says which tag is which club. Each club gets news/<id>.json.
const GUARDIAN_NAPOLI = `<rss version="2.0"><channel><title>Napoli | The Guardian</title>
<item><title>Napoli's midfield is the league's best</title><link>https://www.theguardian.com/football/2026/nov/12/napoli-midfield</link><description>&lt;p&gt;Analysis.&lt;/p&gt;</description><pubDate>Thu, 12 Nov 2026 20:00:00 GMT</pubDate></item>
<item><title>Napoli sign a defender</title><link>https://a.test/n?from=guardian</link><pubDate>Fri, 13 Nov 2026 09:00:00 GMT</pubDate></item>
<item><title>A story about nothing named</title><link>https://www.theguardian.com/football/2026/nov/11/untagged-by-name</link><pubDate>Wed, 11 Nov 2026 09:00:00 GMT</pubDate></item></channel></rss>`;

describe("each club's own news file", () => {
  const api = () => {
    const out = tmp();
    build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), out, seasons: ["2025-26"], now: "2026-10-31T17:00:00Z" });
    return join(out, "api/v1");
  };
  const GENERAL = `<rss><channel><item><title>Napoli sign a defender</title><link>https://a.test/n</link><pubDate>Fri, 13 Nov 2026 09:00:00 GMT</pubDate></item></channel></rss>`;
  const raw = () => {
    const dir = tmp();
    writeFileSync(join(dir, "bbc-sport.xml"), GENERAL);
    mkdirSync(join(dir, "club"));
    writeFileSync(join(dir, "club", "napoli.xml"), GUARDIAN_NAPOLI);
    return dir;
  };
  const read = (dir: string, id: string) => JSON.parse(readFileSync(join(dir, "news", `${id}.json`), "utf8"));

  it("holds the club's Guardian stories (all about the club, whatever the headline says) and the general stories that name it, newest first, each once", () => {
    const dir = api();
    buildNews({ api: dir, raw: raw(), now: "2026-11-13T10:00:00Z" });
    const napoli = read(dir, "napoli");
    expect(napoli.articles.map((a: { title: string }) => a.title)).toEqual(["Napoli sign a defender", "Napoli's midfield is the league's best", "A story about nothing named"]);
    expect(napoli.articles.every((a: { clubs: string[] }) => a.clubs.includes("napoli"))).toBe(true);   // the Guardian's tag says so
    expect(napoli.articles[0].source).toBe("BBC Sport");                                                // the general copy, not the Guardian's twin
  });

  it("is written for every club, empty when nothing is known, and matches the schema", () => {
    const dir = api();
    buildNews({ api: dir, raw: raw(), now: "2026-11-13T10:00:00Z" });
    expect(read(dir, "juventus")).toEqual({ generatedAt: "2026-11-13T10:00:00Z", articles: [] });
    const schema = JSON.parse(readFileSync("data/api/schema.json", "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
    ajv.addSchema(schema);
    for (const id of ["napoli", "juventus"]) expect(ajv.validate(`${schema.$id}#/$defs/news`, read(dir, id)), `${id} ${JSON.stringify(ajv.errors)}`).toBe(true);
  });

  it("a broken club feed gives that club the general stories only, and never fails the build", () => {
    const dir = api(), r = raw();
    writeFileSync(join(r, "club", "napoli.xml"), "<html>not a feed");
    buildNews({ api: dir, raw: r, now: "2026-11-13T10:00:00Z" });
    expect(read(dir, "napoli").articles.map((a: { title: string }) => a.title)).toEqual(["Napoli sign a defender"]);
  });
});

describe("fetching the clubs' feeds", () => {
  const feeds = { napoli: "napoli", juventus: "juventus", inter: "intermilan", milan: "acmilan", roma: "roma", lazio: "lazio" };

  it("asks the Guardian for each club's tag feed, a few at a time, and keeps the saved copy of one that fails", async () => {
    const dir = tmp();
    mkdirSync(join(dir, "club"));
    writeFileSync(join(dir, "club", "lazio.xml"), GUARDIAN_NAPOLI);
    let inFlight = 0, most = 0;
    const urls: string[] = [], agents: string[] = [];
    const fetchStub = async (url: string, init: { headers: Record<string, string> }) => {
      urls.push(url); agents.push(init.headers["User-Agent"]);
      inFlight++; most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return url.includes("/lazio/") ? new Response("down", { status: 503 }) : new Response(GUARDIAN_NAPOLI);
    };
    const done = await fetchClubFeeds({ raw: dir, fetch: fetchStub, feeds, pool: 3, gap: 0 });
    expect(done).toEqual({ saved: 5, kept: 1 });
    expect(urls).toContain("https://www.theguardian.com/football/intermilan/rss");
    expect(most).toBeLessThanOrEqual(3);
    expect(agents.every((a) => a === "golboard-news (personal football pages)")).toBe(true);
    expect(readFileSync(join(dir, "club", "inter.xml"), "utf8")).toBe(GUARDIAN_NAPOLI);   // saved under our id, not the Guardian's tag
    expect(readFileSync(join(dir, "club", "lazio.xml"), "utf8")).toBe(GUARDIAN_NAPOLI);   // the old copy stays
  });

  it("does not throw when the network is down", async () => {
    const done = await fetchClubFeeds({ raw: tmp(), fetch: async () => { throw new Error("offline"); }, feeds, gap: 0 });
    expect(done).toEqual({ saved: 0, kept: 6 });
  });

  it("knows which Guardian tag is which club (data/api/guardian-feeds.json), including the big names whose tag drops the hyphens", () => {
    const map = guardianFeeds();
    expect(map.juventus).toBe("juventus");
    expect(map["manchester-city"]).toBe("manchestercity");
    expect(map.milan).toBe("acmilan");
    for (const [id, tag] of Object.entries(map)) {
      expect(id, id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(tag, id).toMatch(/^[a-z0-9-]+$/);
    }
    expect(Object.keys(map).length).toBeGreaterThan(100);
  });
});
