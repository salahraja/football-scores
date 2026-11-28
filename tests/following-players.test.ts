// @vitest-environment jsdom
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { reduceMatch } from "../scripts/api/espn.mjs";
import { pages } from "../scripts/api/pages.mjs";

// The players chosen in the setup (Salah, 2026-11-25) show on Following: each with their club, their goals when Wikipedia's top scorers
// list them, and their latest game with detail, linked to its page.
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-fp-")); dirs.push(d); return d; };
afterAll(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const { summary, plays } = JSON.parse(readFileSync("tests/fixtures/espn/invented-match.json", "utf8"));

// a 2025-26 site with this season's Serie A statistics section beside its grid, and one game with detail (Juventus 2-0 Parma)
const out = tmp();
{
  const wiki = tmp(), espn = tmp();
  mkdirSync(join(wiki, "2025-26"), { recursive: true });
  const grid = JSON.parse(readFileSync("tests/fixtures/wikipedia/2025-26/it.1.json", "utf8"));
  const stats = JSON.parse(readFileSync("tests/fixtures/wikipedia/2026-27/leaders/it-1.json", "utf8")).stats;
  writeFileSync(join(wiki, "2025-26", "it-1.json"), JSON.stringify({ ...grid, stats: { title: "t", revid: 1, timestamp: "x", text: stats } }));
  mkdirSync(join(espn, "2025-26", "it-1"), { recursive: true });
  writeFileSync(join(espn, "2025-26", "it-1", "9001.json"), JSON.stringify({ ...reduceMatch(summary, plays), kickoff: "2025-08-24T18:45Z",
    home: { name: "Juventus", score: 2, formation: null }, away: { name: "Parma Calcio 1913", score: 0, formation: null } }));
  build({ input: "tests/fixtures/openfootball", wikipedia: wiki, espn, out, seasons: ["2025-26"], now: "2026-05-25T09:00:00Z" });
  pages({ api: join(out, "api/v1"), out });
}
const SCRIPT = readFileSync(join(out, "leagues/follow.js"), "utf8");
const PAGE = readFileSync(join(out, "following/index.html"), "utf8");
const memory = new Map<string, string>();
const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, String(v)), clear: () => memory.clear() };
const settle = () => new Promise((r) => setTimeout(r, 20));
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
  memory.clear();
  document.body.innerHTML = PAGE.slice(PAGE.indexOf("<main"), PAGE.indexOf("</main>") + 7);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    try { return new Response(readFileSync(join(out, String(input).replace(/^\//, "")), "utf8")); } catch { return new Response("", { status: 404 }); }
  }));
});

describe("Following: your players", () => {
  it("the page has the box and a way back into the setup", () => {
    expect(PAGE).toContain('id="my-players"');
    expect(PAGE).toContain('href="/?setup=1"');
  });

  it("shows each player's club, their goals when the top scorers list them, and their last game linked to its page", async () => {
    memory.set("golboard.players", JSON.stringify([
      { id: "12", name: "Bo Lund", team: "juventus", league: "it-1", club: "Juventus" },
      { id: "77", name: "Donyell Malen", team: "roma", league: "it-1", club: "Roma" },
    ]));
    (0, eval)(SCRIPT);
    await settle();
    const rows = [...document.querySelectorAll("#my-players > li")].map((li) => li.textContent!.replace(/\s+/g, " ").trim());
    expect(rows[0]).toMatch(/Bo Lund · Juventus/);
    expect(rows[0]).toMatch(/Juventus 2–0 Parma/);
    expect(rows[0]).toMatch(/2 touches, 2 shots, 1 goal/);
    expect(document.querySelector('#my-players a[href="/leagues/it-1/2025-08-24-juventus-parma/"]')).not.toBeNull();
    expect(rows[1]).toMatch(/Donyell Malen · Roma/);
    expect(rows[1]).toMatch(/12 goals, 1st in Serie A/);
    expect(rows[1]).toMatch(/No game with detail yet/);
    expect((document.getElementById("players-none") as HTMLElement).hidden).toBe(true);
  });

  it("with no players chosen, it says how to pick some", async () => {
    (0, eval)(SCRIPT);
    await settle();
    expect(document.querySelectorAll("#my-players > li")).toHaveLength(0);
    expect((document.getElementById("players-none") as HTMLElement).hidden).toBe(false);
  });
});
