// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error a Netlify build plugin, plain JavaScript with no types
import * as plugin from "../netlify/plugins/espn-cache/index.js";

// Netlify's builds start from a fresh checkout, so the ESPN games and squads (data/espn, git-ignored) were fetched again on every
// build: 156 squads, and only the last three days of games, which is why ESPN's second witness missed Juventus 0-10 Venezia. A build
// plugin of our own keeps the folder in Netlify's build cache: restored before the build command, saved after it.
describe("Netlify keeps data/espn between builds", () => {
  it("restores the folder before the build and saves it after", async () => {
    const calls: string[] = [];
    const utils = { cache: { restore: async (p: string) => { calls.push(`restore ${p}`); return true; }, save: async (p: string) => { calls.push(`save ${p}`); return true; } } };
    await plugin.onPreBuild({ utils });
    await plugin.onPostBuild({ utils });
    expect(calls).toEqual(["restore data/espn", "save data/espn"]);
  });

  it("is switched on in netlify.toml", () => {
    expect(readFileSync("netlify.toml", "utf8")).toMatch(/\[\[plugins\]\]\s*package = "\.\/netlify\/plugins\/espn-cache"/);
    expect(readFileSync("netlify/plugins/espn-cache/manifest.yml", "utf8")).toMatch(/^name: espn-cache/m);
  });
});
