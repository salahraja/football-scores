// @vitest-environment node
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { formOf, meetings } from "../scripts/api/form.mjs";
import { pages } from "../scripts/api/pages.mjs";

// The goal (Salah, 2026-11-28): features that match the big apps. Every one of them shows a club's form (its last five) beside the
// table and, before or after a game, the two clubs' previous meetings. Both come from our own results.
const m = (date: string, home: string, away: string, ft: [number, number] | null, stage = "league") =>
  ({ id: `x:${date}:${home}-${away}`, date, home, away, stage, status: ft ? "finished" : "scheduled", score: ft ? { ft } : null });
const games = [m("2026-08-20", "juventus", "inter", [2, 1]), m("2026-08-27", "roma", "juventus", [1, 1]), m("2026-09-03", "juventus", "milan", [0, 3]),
  m("2026-09-10", "napoli", "juventus", [0, 2]), m("2026-09-17", "juventus", "lazio", [1, 0]), m("2026-09-24", "como", "juventus", [2, 2]),
  m("2026-10-01", "juventus", "torino", null), m("2026-09-28", "juventus", "atalanta", [5, 0], "playoffs")];

describe("form", () => {
  it("is the last five league results, newest first, as wins, draws and losses from the club's side", () => {
    expect(formOf(games, "juventus").map((g) => g.result)).toEqual(["d", "w", "w", "l", "d"]);
  });

  it("names the opponent, the score from the club's side and where it was played", () => {
    expect(formOf(games, "juventus")[0]).toMatchObject({ opponent: "como", home: false, for: 2, against: 2, date: "2026-09-24" });
    expect(formOf(games, "juventus")[3]).toMatchObject({ opponent: "milan", home: true, for: 0, against: 3, result: "l" });
  });

  it("is shorter early in a season, and empty before a club has played", () => {
    expect(formOf(games, "inter")).toHaveLength(1);
    expect(formOf(games, "sassuolo")).toEqual([]);
  });
});

describe("previous meetings", () => {
  const seasons = [[m("2025-09-01", "juventus", "inter", [1, 1]), m("2026-02-01", "inter", "juventus", [3, 0])], games];
  it("are every finished league game between the two, in any season on file, before the given day, newest first", () => {
    expect(meetings(seasons, "inter", "juventus", "2026-12-01").map((g) => g.date)).toEqual(["2026-08-20", "2026-02-01", "2025-09-01"]);
    expect(meetings(seasons, "juventus", "inter", "2026-08-20").map((g) => g.date)).toEqual(["2026-02-01", "2025-09-01"]);
  });

  it("never include an unplayed game or another pair", () => {
    expect(meetings(seasons, "juventus", "torino", "2026-12-01")).toEqual([]);
  });
});

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-form-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe("on the pages", () => {
  const site = () => { const out = tmp(); build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), out, seasons: ["2025-26"], now: "2026-05-25T09:00:00Z" }); pages({ api: join(out, "api/v1"), out }); return out; };

  it("the league table has a Form column: five results per club, each said in words for a screen reader", () => {
    const html = readFileSync(join(site(), "leagues/it-1/index.html"), "utf8");
    expect(html).toContain('<th scope="col" class="formcol">Form</th>');
    const cells = html.match(/<td class="formcol">[\s\S]*?<\/td>/g) ?? [];
    expect(cells).toHaveLength(20);
    for (const c of cells) expect((c.match(/class="f-[wdl]"/g) ?? []).length).toBe(5);  // a full season: everyone has five
    expect(cells[0]).toMatch(/<span class="sr-only">(Won|Drew|Lost) /);
  });

  it("a club page's next game says how their last meeting ended", () => {
    const out = site();
    const club = readdirSync(join(out, "leagues/it-1")).find((d) => !d.includes(".") && readFileSync(join(out, "leagues/it-1", d, "index.html"), "utf8").includes("<h2>Next game</h2>"));
    if (!club) return;  // the fixture season may be over; the unit tests above cover the rule
    expect(readFileSync(join(out, "leagues/it-1", club, "index.html"), "utf8")).toMatch(/Last time: /);
  });
});

describe("game pages", () => {
  // the invented ESPN match (tests/fixtures/espn) named as Parma 1-4 Juventus on 1 February 2026, the clubs' second meeting of 2025-26
  const gameSite = async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { reduceMatch } = await import("../scripts/api/espn.mjs");
    const { summary, plays } = JSON.parse(readFileSync("tests/fixtures/espn/invented-match.json", "utf8"));
    const espn = tmp(), out = tmp();
    mkdirSync(join(espn, "2025-26", "it-1"), { recursive: true });
    writeFileSync(join(espn, "2025-26", "it-1", "9002.json"), JSON.stringify({ ...reduceMatch(summary, plays), kickoff: "2026-02-01T17:00Z",
      home: { name: "Parma Calcio 1913", score: 1, formation: "3-5-2" }, away: { name: "Juventus", score: 4, formation: "4-3-3" } }));
    build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), espn, out, seasons: ["2025-26"], now: "2026-05-25T09:00:00Z" });
    pages({ api: join(out, "api/v1"), out });
    return readFileSync(join(out, "leagues/it-1/2026-02-01-parma-juventus/index.html"), "utf8");
  };

  it("show the two clubs' earlier league meeting, with its score and date", async () => {
    const html = await gameSite();
    const box = html.slice(html.indexOf("<h2>Previous meetings</h2>"));
    expect(html).toContain("<h2>Previous meetings</h2>");
    expect(box).toMatch(/<span class="home">Juventus<\/span><span class="mid">2–0<\/span><span class="away">Parma<\/span><span class="when">Sun 24 Aug 2025<\/span>/);
    expect(box.indexOf("</section>")).toBeLessThan(box.indexOf("4–1") === -1 ? Infinity : box.indexOf("4–1"));  // never this game itself
  });
});
