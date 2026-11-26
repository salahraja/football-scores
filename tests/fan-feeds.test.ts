// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { buildNews, fanFeeds, fetchFanFeeds } from "../scripts/api/news.mjs";

// Salah, 2026-11-26: "We also should be pulling from team fan sites. For juventus here's one for example https://www.juvefc.com".
// Each club's fan sites (data/api/fan-feeds.json) are read like the Guardian's club feeds: their stories are all about the club, go in
// that club's own news file only (not the general headlines), and are named by the site.
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-fan-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const FEED = (title: string, at: string) => `<rss><channel><item><title>${title}</title><link>https://fan.test/${encodeURIComponent(title)}</link><pubDate>${at}</pubDate><description>About ${title}</description></item></channel></rss>`;

describe("fan sites", () => {
  it("are listed per club, Juventus first with juvefc.com", () => {
    expect(fanFeeds().juventus).toContainEqual({ name: "Juvefc.com", url: "https://www.juvefc.com/feed/" });
  });

  it("are downloaded beside the Guardian's club feeds; one that fails or is not a feed keeps its saved copy", async () => {
    const raw = tmp();
    mkdirSync(join(raw, "fan", "juventus"), { recursive: true });
    writeFileSync(join(raw, "fan", "juventus", "old-site.xml"), FEED("Kept", "Fri, 13 Nov 2026 09:00:00 GMT"));
    const feeds = { juventus: [{ name: "Juvefc.com", url: "https://a.test/feed" }, { name: "Old Site", url: "https://b.test/feed" }] };
    const asked: string[] = [];
    const done = await fetchFanFeeds({ raw, feeds, gap: 0, fetch: (async (url: string) => {
      asked.push(url);
      return url.startsWith("https://a.test") ? new Response(FEED("Fresh", "Fri, 13 Nov 2026 10:00:00 GMT")) : new Response("<html>nope", { status: 200 });
    }) as never });
    expect(asked).toEqual(["https://a.test/feed", "https://b.test/feed"]);
    expect(done).toEqual({ saved: 1, kept: 1 });
    expect(readFileSync(join(raw, "fan", "juventus", "juvefc-com.xml"), "utf8")).toContain("Fresh");
    expect(readFileSync(join(raw, "fan", "juventus", "old-site.xml"), "utf8")).toContain("Kept");
  });

  it("go in the club's own news, named by the site, and never in the general headlines", () => {
    const out = tmp();
    build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), out, seasons: ["2025-26"], now: "2026-10-31T17:00:00Z" });
    const api = join(out, "api/v1");
    const raw = tmp();
    mkdirSync(join(raw, "fan", "juventus"), { recursive: true });
    // a fan site's headline need not name the club: its feed is all about the club
    writeFileSync(join(raw, "fan", "juventus", "juvefc-com.xml"), FEED("Neto set for his first game since 2017", "Wed, 25 Nov 2026 09:00:00 GMT"));
    buildNews({ api, raw, now: "2026-11-26T10:00:00Z", fans: { juventus: [{ name: "Juvefc.com", url: "https://www.juvefc.com/feed/" }] } });
    const juve = JSON.parse(readFileSync(join(api, "news", "juventus.json"), "utf8"));
    expect(juve.articles).toHaveLength(1);
    expect(juve.articles[0]).toMatchObject({ title: "Neto set for his first game since 2017", source: "Juvefc.com", clubs: ["juventus"] });
    expect(JSON.parse(readFileSync(join(api, "news.json"), "utf8")).articles).toEqual([]);
    expect(existsSync(join(api, "news", "napoli.json"))).toBe(true);
  });
});

describe("the fan-site list", () => {
  it("names clubs by our ids and each site by name with an https feed, at most two a club", () => {
    const all = fanFeeds();
    expect(Object.keys(all).length).toBeGreaterThan(60);
    for (const [id, sites] of Object.entries(all)) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(sites.length).toBeLessThanOrEqual(2);
      for (const s of sites) { expect(s.name.length).toBeGreaterThan(0); expect(s.url).toMatch(/^https:\/\//); }
    }
  });

  it("holds no site of a network left out on purpose (betting links, or founded in Israel)", () => {
    const urls = Object.values(fanFeeds()).flat().map((s) => s.url);
    expect(urls.filter((u) => /vitalfootball\.co\.uk|fansided\.com|minutemedia|deportivo-la-coruna\.com/.test(u))).toEqual([]);
  });
});

describe("Atom feeds", () => {
  // SB Nation's club blogs and some others publish Atom (<feed><entry>), not RSS (<rss><item>): 19 of the 108 fan feeds on 2026-11-26
  const ATOM = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title type="text">A Blog</title>
<entry><author><name>A Writer</name></author><title type="html"><![CDATA[The Daily Hilario: Thursday]]></title>
<link rel="alternate" type="text/html" href="https://blog.test/daily-hilario" /><id>https://blog.test/?p=1</id>
<updated>2026-11-26T08:20:52+00:00</updated><published>2026-11-26T08:00:00+00:00</published>
<summary type="html"><![CDATA[<p>Chelsea news &amp; notes.</p>]]></summary></entry>
<entry><title>No link here</title><updated>2026-11-26T07:00:00+00:00</updated></entry></feed>`;

  it("are read like RSS: title, the page link, the published date and the summary", async () => {
    const { parseRss } = await import("../scripts/api/news.mjs");
    expect(parseRss(ATOM, "A Blog")).toEqual([{ title: "The Daily Hilario: Thursday", summary: "Chelsea news & notes.", url: "https://blog.test/daily-hilario",
      source: "A Blog", published: "2026-11-26T08:00:00.000Z", image: null, tags: [] }]);
  });
});

describe("the feed shapes fan sites use", () => {
  it("Blogger's Atom, with its attributes in single quotes", async () => {
    const { parseRss } = await import("../scripts/api/news.mjs");
    const xml = `<feed xmlns='http://www.w3.org/2005/Atom'><entry><id>x</id><published>2026-11-22T16:18:23.438+00:00</published><title type='text'>Tats leads the way</title>
<link rel='replies' type='text/html' href='https://b.test/2026/11/x.html#comment-form'/><link rel='alternate' type='text/html' href='https://b.test/2026/11/x.html' title='Tats'/></entry></feed>`;
    expect(parseRss(xml, "Jim Brown's Journal")[0]).toMatchObject({ title: "Tats leads the way", url: "https://b.test/2026/11/x.html", published: "2026-11-22T16:18:23.438Z" });
  });

  it("KUMB's RSS, whose items carry a plain <date> instead of pubDate (read as UTC)", async () => {
    const { parseRss } = await import("../scripts/api/news.mjs");
    const xml = `<rss version="2.0"><channel><item><title>Every word Scott Parker said</title><date>2026-11-26 16:35:27</date><link>http://www.kumb.com/story.php?id=140574</link><description>Parker urged the fans.</description></item></channel></rss>`;
    expect(parseRss(xml, "KUMB")[0]).toMatchObject({ title: "Every word Scott Parker said", url: "http://www.kumb.com/story.php?id=140574", published: "2026-11-26T16:35:27.000Z" });
  });
});
