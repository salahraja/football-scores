import { existsSync } from "node:fs";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

// The pages must render the same HTML from the generated JSON (npm run data) as from the in-browser TS logic.
const haveGenerated = existsSync("src/data/generated/standings.json") && existsSync("src/data/generated/results.json");

async function render(mode: "ts" | "generated") {
  vi.resetModules();
  vi.stubEnv("VITE_DATA", mode === "generated" ? "generated" : "");
  const { default: Standings } = await import("../src/views/StandingsView.vue");
  const { default: Results } = await import("../src/views/ResultsView.vue");
  return [mount(Standings).html(), mount(Results).html()];
}

afterEach(() => vi.unstubAllEnvs());

describe("views", () => {
  it("results view shows one card per sample event with its outcome", async () => {
    const [, results] = await render("ts");
    expect((results.match(/class="card"/g) ?? []).length).toBe(4);
    expect(results).toContain('data-outcome="home"');
    expect(results).toContain("Matchday 10");
  });
  it.skipIf(!haveGenerated)("generated data renders the same HTML as the TS path", async () => {
    expect(await render("generated")).toEqual(await render("ts"));
  });
});
