// @vitest-environment node
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv/dist/2020";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { tournaments } from "../scripts/api/config.mjs";
import { reduceMatch } from "../scripts/api/espn.mjs";
import { pages } from "../scripts/api/pages.mjs";

// Game detail from ESPN for the cups and internationals too (build.mjs gameFiles, pages.mjs gamePages), paired with the games we read
// from Wikipedia's match boxes. A hidden team (tournaments.json `hide`: Israel) never gets a game file or page, and is not reported as a
// name we could not map either.
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-cup-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const { summary, plays } = JSON.parse(readFileSync("tests/fixtures/espn/invented-match.json", "utf8"));
const schema = JSON.parse(readFileSync("data/api/schema.json", "utf8"));
const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
ajv.addSchema(schema);
const check = (def: string, body: unknown) => ajv.validate(`${schema.$id}#/$defs/${def}`, body) ? [] : ajv.errors!.map((e) => `${e.instancePath} ${e.message}`);

const site = (games: Array<{ id: string; file: string; kickoff: string; home: [string, number]; away: [string, number] }>) => {
  const wiki = tmp(), espn = tmp(), out = tmp();
  mkdirSync(join(wiki, "2026-27"));
  for (const t of tournaments()) copyFileSync(`tests/fixtures/wikipedia/2026-27/${t.id}.json`, join(wiki, "2026-27", `${t.id}.json`));
  for (const g of games) {
    mkdirSync(join(espn, "2026-27", g.id), { recursive: true });
    writeFileSync(join(espn, "2026-27", g.id, `${g.file}.json`), JSON.stringify({ ...reduceMatch(summary, plays), espn: g.file, kickoff: g.kickoff,
      home: { name: g.home[0], score: g.home[1], formation: null }, away: { name: g.away[0], score: g.away[1], formation: null } }));
  }
  build({ input: "tests/fixtures/openfootball", wikipedia: wiki, espn, out, seasons: ["2025-26"], now: "2026-11-14T03:00:00Z" });
  pages({ api: join(out, "api/v1"), out });
  return {
    json: (p: string) => (existsSync(join(out, p)) ? JSON.parse(readFileSync(join(out, p), "utf8")) : undefined),
    html: (p: string) => (existsSync(join(out, p)) ? readFileSync(join(out, p), "utf8") : undefined),
  };
};

describe("cup and international games in detail", () => {
  it("a Champions League game gets a file in the contract, a page, and a link from the cup's page", () => {
    // Slavia Prague 1-2 Arsenal on 4 November 2026, among the cup page's latest results on 14 November
    const s = site([{ id: "champions-league", file: "7001", kickoff: "2026-11-04T20:00Z", home: ["Slavia Prague", 1], away: ["Arsenal", 2] }]);
    const game = s.json("api/v1/champions-league/2026-27/games/2026-11-04-slavia-prague-arsenal.json");
    expect(check("game", game)).toEqual([]);
    expect(game.match).toBe("champions-league:2026-11-04:slavia-prague-arsenal");
    expect(s.json("api/v1/meta.json").tournaments["champions-league"]["2026-27"].espn).toEqual({ games: 1, unknown: [], disagree: [], overruled: [] });
    expect(s.html("leagues/champions-league/2026-11-04-slavia-prague-arsenal/index.html")).toMatch(/Slavia Prague <span class="score">1–2<\/span> Arsenal/);
    expect(s.html("leagues/champions-league/index.html")).toContain('href="/leagues/champions-league/2026-11-04-slavia-prague-arsenal/"');
  });

  it("a hidden team's game gets no file and no page, and is not reported as unknown", () => {
    const s = site([{ id: "europa-league", file: "7002", kickoff: "2026-09-16T16:45Z", home: ["Hapoel Be'er Sheva", 0], away: ["Dinamo Zagreb", 0] }]);
    expect(s.json("api/v1/europa-league/2026-27/games/2026-09-16-hapoel-beer-sheva-dinamo-zagreb.json")).toBeUndefined();
    expect(s.json("api/v1/meta.json").tournaments["europa-league"]["2026-27"].espn).toEqual({ games: 0, unknown: [], disagree: [], overruled: [] });
    expect(s.html("leagues/europa-league/2026-09-16-hapoel-beer-sheva-dinamo-zagreb/index.html")).toBeUndefined();
  });
});
