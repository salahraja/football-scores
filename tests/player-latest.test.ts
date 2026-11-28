// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv/dist/2020";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { reduceMatch } from "../scripts/api/espn.mjs";

// For Following's players (the setup, Salah 2026-11-25: "Following shows their goals and their last game"): each league season gets one
// small index of every player's latest game with detail, so the page reads one file, not every game.
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-latest-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const { summary, plays } = JSON.parse(readFileSync("tests/fixtures/espn/invented-match.json", "utf8"));

describe("each player's latest game", () => {
  it("names the game, its score and what the player did in it", () => {
    const espn = tmp(), out = tmp();
    mkdirSync(join(espn, "2025-26", "it-1"), { recursive: true });
    // the invented match as Juventus 2-0 Parma on 24 August 2025 (a game in the 2025-26 fixtures)
    writeFileSync(join(espn, "2025-26", "it-1", "9001.json"), JSON.stringify({ ...reduceMatch(summary, plays), kickoff: "2025-08-24T18:45Z",
      home: { name: "Juventus", score: 2, formation: null }, away: { name: "Parma Calcio 1913", score: 0, formation: null } }));
    build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), espn, out, seasons: ["2025-26"], now: "2026-05-25T09:00:00Z" });
    const file = JSON.parse(readFileSync(join(out, "api/v1/it-1/2025-26/player-latest.json"), "utf8"));
    const schema = JSON.parse(readFileSync("data/api/schema.json", "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
    ajv.addSchema(schema);
    expect(ajv.validate(`${schema.$id}#/$defs/playerLatest`, file), JSON.stringify(ajv.errors)).toBe(true);
    // Bo Lund (id 12): the header goal and the shot off the post
    expect(file.players["12"]).toEqual({ game: "2025-08-24-juventus-parma", date: "2025-08-24", title: "Juventus 2–0 Parma", touches: 2, shots: 2, goals: 1 });
    // Cy Moor came on and never touched the ball; he still played
    expect(file.players["13"]).toEqual({ game: "2025-08-24-juventus-parma", date: "2025-08-24", title: "Juventus 2–0 Parma", touches: 0, shots: 0, goals: 0 });
  });
});
