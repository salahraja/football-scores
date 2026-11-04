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
    expect(readdirSync(join(out, "leagues")).filter((f) => !f.includes(".")).sort())
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
    expect(html).toContain("Waiting for the result");
    expect(html).not.toContain("Next fixtures</h2>\n<ul");
    expect((html.match(/·[^<]*\d{2}:\d{2} Italy time/g) ?? []).length).toBe(0);  // a kick-off time is shown once, in the middle
  });

  it("credits the sources the page used, and no others", () => {
    const html = page(site(), "leagues/it-1/index.html");
    expect(html).toContain('href="https://github.com/openfootball/football.json"');
    expect(html).not.toContain("wikipedia.org");
  });

  it("has no scripts, escapes names, and keeps each page small", () => {
    const out = site();
    for (const id of ["it-1", "en-2"]) {
      const html = page(out, `leagues/${id}/index.html`);
      expect(html).not.toMatch(/<script/i);
      expect(html.length).toBeLessThan(40_000);
    }
    expect(page(out, "leagues/en-1/index.html")).toContain("Brighton &amp; Hove Albion");
    expect(existsSync(join(out, "leagues/site.css"))).toBe(true);
  });
});
