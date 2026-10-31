// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fetchSeasons } from "../scripts/api/fetch-openfootball.mjs";

// Downloading openfootball's season files: a file that downloads and looks like a season replaces the saved one; anything else keeps the
// saved one and says why. It never throws, so a build never fails for lack of fresh data.
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-fetch-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const season = { name: "Italian Serie A 2026/27", matches: [{ round: "Matchday 1", date: "2026-08-22", team1: "Genoa CFC", team2: "US Lecce", score: { ft: [1, 0] } }] };
const reply = (status: number, body: unknown) => async () => ({ ok: status === 200, status, json: async () => body });

describe("fetching openfootball", () => {
  it("saves a good file and keeps the saved one when a download fails or looks wrong", async () => {
    const out = tmp();
    mkdirSync(join(out, "2026-27"), { recursive: true });
    writeFileSync(join(out, "2026-27", "en.1.json"), JSON.stringify({ name: "kept", matches: [] }));
    const bodies: Record<string, () => Promise<unknown>> = {
      "it.1": reply(200, season), "en.1": reply(500, {}), "es.1": reply(200, { nope: true }),
    };
    const report = await fetchSeasons({ out, seasons: ["2026-27"], codes: ["it.1", "en.1", "es.1"],
      fetchFn: async (url: string) => (bodies[url.split("/").pop()!.replace(".json", "")] as () => Promise<unknown>)() as never });
    expect(JSON.parse(readFileSync(join(out, "2026-27", "it.1.json"), "utf8")).name).toBe("Italian Serie A 2026/27");
    expect(JSON.parse(readFileSync(join(out, "2026-27", "en.1.json"), "utf8")).name).toBe("kept");
    expect(existsSync(join(out, "2026-27", "es.1.json"))).toBe(false);
    expect(report).toEqual({ saved: ["2026-27/it.1"], kept: ["2026-27/en.1 (HTTP 500)", "2026-27/es.1 (not a season file)"] });
  });

  it("asks only openfootball's own address", async () => {
    const asked: string[] = [];
    await fetchSeasons({ out: tmp(), seasons: ["2026-27"], codes: ["it.1"], fetchFn: async (url: string) => { asked.push(url); return { ok: true, status: 200, json: async () => season } as never; } });
    expect(asked).toEqual(["https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/it.1.json"]);
  });
});
