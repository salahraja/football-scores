// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { reduceMatch } from "../scripts/api/espn.mjs";
import { pages } from "../scripts/api/pages.mjs";

// A page per game ESPN has detail for (build.mjs gameFiles): the score, the timeline, a shot map and touch maps, drawn as SVG when the
// page is built, so they need no script, follow the light and dark themes through CSS classes, and read to a screen reader.
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-game-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const { summary, plays } = JSON.parse(readFileSync("tests/fixtures/espn/invented-match.json", "utf8"));
const site = () => {
  const espn = tmp(), out = tmp();
  mkdirSync(join(espn, "2025-26", "it-1"), { recursive: true });
  // the invented match, named and dated as Juventus 2-0 Parma on 24 August 2025 (a game in the 2025-26 fixtures)
  writeFileSync(join(espn, "2025-26", "it-1", "9001.json"), JSON.stringify({ ...reduceMatch(summary, plays), kickoff: "2025-08-24T18:45Z",
    home: { name: "Juventus", score: 2, formation: "4-3-3" }, away: { name: "Parma Calcio 1913", score: 0, formation: "3-5-2" } }));
  build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), espn, out, seasons: ["2025-26"], now: "2026-05-25T09:00:00Z" });
  pages({ api: join(out, "api/v1"), out });
  // read as text: an apostrophe in a minute ("53'") is written &#39; in the HTML
  return (path: string) => readFileSync(join(out, path), "utf8").replace(/&#39;/g, "'");
};
const PAGE = "leagues/it-1/2025-08-24-juventus-parma/index.html";

describe("a game page", () => {
  it("is written for each game with detail, and the club pages link to it", () => {
    const read = site();
    const html = read(PAGE);
    expect(html).toMatch(/<h1[^>]*>Juventus <span class="score">2–0<\/span> Parma<\/h1>/);
    expect(read("leagues/it-1/juventus/index.html")).toContain('href="/leagues/it-1/2025-08-24-juventus-parma/"');
    expect(html).toContain('href="/leagues/it-1/"');
    expect(html).toContain('href="https://www.espn.com/soccer/match/_/gameId/9001"');
  });

  it("lists the goals, cards and substitutions with the players' names", () => {
    const html = site()(PAGE);
    const timeline = html.slice(html.indexOf('id="timeline"'), html.indexOf("</section>", html.indexOf('id="timeline"')));
    expect(timeline).toContain("53'");
    expect(timeline).toContain("Bo Lund");
    expect(timeline).toContain("Ana Ito");  // the assist
    expect(timeline).toMatch(/Cy Moor[\s\S]*on[\s\S]*Ana Ito/);
    expect(timeline).toContain("Own goal");
  });

  it("draws every shot once, sized by xG, marked by outcome, with a title a screen reader can read", () => {
    const html = site()(PAGE);
    const map = html.slice(html.indexOf('<svg class="pitch shots"'), html.indexOf("</svg>", html.indexOf('<svg class="pitch shots"')));
    expect(map).toContain('role="img"');
    expect(map.match(/<circle class="shot /g)).toHaveLength(5);
    expect(map.match(/class="shot home goal"/g)).toHaveLength(1);
    expect(map).toMatch(/<title>53' Bo Lund: goal, xG 0\.31<\/title>/);
    // the home side attacks to the right: its goal from x = 95.7 sits near the right end (105 m)
    const goal = map.match(/<circle class="shot home goal" cx="([\d.]+)"/)!;
    expect(Number(goal[1])).toBeGreaterThan(95);
    // and a list of the shots for anyone who cannot see the map
    expect(html).toMatch(/<table class="standings shotlist">/);
  });

  it("draws each side's touches in 30 zones with the count in each, and each player's behind a tap", () => {
    const html = site()(PAGE);
    const maps = html.match(/<svg class="pitch zones"[\s\S]*?<\/svg>/g)!;
    expect(maps.length).toBe(2 + 4);  // two sides, four players with touches
    expect(maps[0].match(/<rect class="z/g)).toHaveLength(30);
    expect(maps[0]).toMatch(/<title[^>]*>Juventus: 6 touches<\/title>/);
    expect(html).toMatch(/<details><summary>[^<]*Ana Ito[^<]*4 touches/);
    expect(maps.every((m) => !/fill="#/.test(m))).toBe(true);  // colours come from classes, so the dark theme works
  });

  it("adds no script of its own and stays within the size of a league page", () => {
    const html = site()(PAGE);
    // only the two every page loads (following clubs, the theme switch); the maps need none
    expect(html.match(/<script[^>]*>/g)).toEqual(['<script src="/leagues/follow.js" defer>', '<script src="/theme-toggle.js" defer>']);
    expect(html.length).toBeLessThan(60_000);
  });
});

describe("a league without game detail", () => {
  it("has no game pages and no links to them", () => {
    const out = tmp();
    build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), espn: tmp(), out, seasons: ["2025-26"], now: "2026-05-25T09:00:00Z" });
    pages({ api: join(out, "api/v1"), out });
    expect(existsSync(join(out, PAGE))).toBe(false);
    expect(readFileSync(join(out, "leagues/it-1/juventus/index.html"), "utf8")).not.toContain("Shots and touches");
  });
});
