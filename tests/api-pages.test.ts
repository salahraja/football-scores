// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { pages } from "../scripts/api/pages.mjs";

// One plain HTML page per league, made from the published API at the same time (no JavaScript: in our test on a throttled phone it
// showed in 376 ms against 912 ms for the Vue app). Each page says how far its results go and credits every source it used.
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-pages-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const site = () => {
  const out = tmp();
  build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), out, seasons: ["2025-26"], now: "2026-10-31T17:00:00Z" });
  pages({ api: join(out, "api/v1"), out });
  return out;
};
const page = (out: string, path: string) => readFileSync(join(out, path), "utf8");

describe("league pages", () => {
  it("makes one page per league and an index that links them all", () => {
    const out = site();
    expect(readdirSync(join(out, "leagues")).filter((f) => !f.includes(".") && f !== "fonts").sort())
      .toEqual(["de-1", "en-1", "en-2", "es-1", "fr-1", "it-1", "nl-1", "pt-1"]);
    const index = page(out, "leagues/index.html");
    for (const id of ["it-1", "en-1", "pt-1"]) expect(index).toContain(`href="/leagues/${id}/"`);
    expect(index).toContain("<title>Leagues | golboard</title>");
  });

  it("shows the table in order with real table markup, and says how far the results go", () => {
    const html = page(site(), "leagues/it-1/index.html");
    expect(html).toContain("<title>Serie A table, results and fixtures | golboard</title>");
    expect(html).toMatch(/<meta property="og:title" content="Serie A[^"]*"/);
    expect(html).toContain('<table class="standings">');
    expect(html).toContain('<th scope="row" class="left">Internazionale Milano</th>');
    expect(html.indexOf(">Internazionale Milano<")).toBeLessThan(html.indexOf(">Napoli<"));
    expect(html).toContain("Results up to 24 May 2026");
    expect((html.match(/<tr class="row">/g) ?? []).length).toBe(20);
  });

  it("lists recent results and says each league's own time zone for kick-offs", () => {
    const html = page(site(), "leagues/en-1/index.html");
    expect(html).toContain("Latest results");
    expect(html).toMatch(/UK time/);
  });

  it("never shows a game from the build day or before as a fixture still to come: it waits for its result", () => {
    // 2025-26 with its last matchday unscored, built the day after: those games were played, the result is just not in yet
    const input = tmp(), out = tmp();
    const season = JSON.parse(readFileSync("tests/fixtures/openfootball/2025-26/it.1.json", "utf8"));
    const lastDay = season.matches.at(-1).date;
    for (const m of season.matches) if (m.date === lastDay) delete m.score;
    mkdirSync(join(input, "2025-26"), { recursive: true });
    writeFileSync(join(input, "2025-26", "it.1.json"), JSON.stringify(season));
    build({ input, wikipedia: tmp(), out, seasons: ["2025-26"], now: "2026-05-25T09:00:00Z" });
    pages({ api: join(out, "api/v1"), out });
    const html = page(out, "leagues/it-1/index.html");
    expect(html).toContain("<h2>This week</h2>");
    expect(html.indexOf("<h2>This week</h2>")).toBeLessThan(html.indexOf('<table class="standings">'));  // first thing after the title
    expect(html).not.toContain("Next fixtures</h2>\n<ul");
    expect((html.match(/·[^<]*\d{2}:\d{2} Italy time/g) ?? []).length).toBe(0);  // a kick-off time is shown once, in the middle
  });

  it("has arrows to the previous and next league, going round", () => {
    const out = site();
    const it1 = page(out, "leagues/it-1/index.html"), en2 = page(out, "leagues/en-2/index.html");
    expect(it1).toMatch(/<a class="arrow prev" href="\/leagues\/en-2\/" aria-label="Previous league: Championship">/);
    expect(it1).toMatch(/<a class="arrow next" href="\/leagues\/en-1\/" aria-label="Next league: Premier League">/);
    expect(en2).toMatch(/<a class="arrow next" href="\/leagues\/it-1\/"/);
  });

  it("has arrows to step through the games on the poster", () => {
    const html = page(site(), "leagues/it-1/index.html");
    expect(html).toContain('<button class="arrow prev" type="button" data-step="-1" aria-label="Previous game" hidden>');
    expect(html).toContain('<button class="arrow next" type="button" data-step="1" aria-label="Next game" hidden>');
    expect(html).toContain('<script src="/leagues/live.js" defer></script>');  // the arrows need it, so every league page loads it
  });

  it("starts the poster on today's game, and puts an old game still without a result at the end of this week", () => {
    const input = tmp(), out = tmp();
    const season = JSON.parse(readFileSync("tests/fixtures/openfootball/2025-26/it.1.json", "utf8"));
    const lastDay = season.matches.at(-1).date;
    for (const m of season.matches) if (m.date === lastDay) delete m.score;
    const old = season.matches.find((m: { date: string }) => m.date < "2026-05-10");
    delete old.score;  // a game from weeks ago that never got a result (postponed)
    mkdirSync(join(input, "2025-26"), { recursive: true });
    writeFileSync(join(input, "2025-26", "it.1.json"), JSON.stringify(season));
    build({ input, wikipedia: tmp(), out, seasons: ["2025-26"], now: `${lastDay}T09:00:00Z` });
    pages({ api: join(out, "api/v1"), out });
    const html = page(out, "leagues/it-1/index.html");
    expect(html).toMatch(new RegExp(`<div class="feature" data-date="${lastDay}"`));
    const week = html.slice(html.indexOf('id="week"'), html.indexOf('id="table"'));
    expect(week.lastIndexOf(`data-date="${old.date}"`)).toBeGreaterThan(week.lastIndexOf(`data-date="${lastDay}"`));
    expect(week).toContain("result not in");
  });

  it("credits the sources the page used, and no others", () => {
    const html = page(site(), "leagues/it-1/index.html");
    expect(html).toContain('href="https://github.com/openfootball/football.json"');
    expect(html).not.toContain("wikipedia.org");
  });

  it("has one small script, escapes names, and keeps each page small", () => {
    const out = site();
    for (const id of ["it-1", "en-2"]) {
      const html = page(out, `leagues/${id}/index.html`);
      expect(html.match(/<script[^>]*>/gi)).toEqual(['<script src="/leagues/live.js" defer>']);  // the one script, for arrows and live scores
      expect(html.length).toBeLessThan(40_000);
    }
    expect(page(out, "leagues/en-1/index.html")).toContain("Brighton &amp; Hove Albion");
    expect(existsSync(join(out, "leagues/site.css"))).toBe(true);
  });
});
