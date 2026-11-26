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
