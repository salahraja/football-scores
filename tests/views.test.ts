import { existsSync, readFileSync } from "node:fs";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeSource } from "../src/data";

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
  it.skipIf(!haveGenerated)("generated data renders the same HTML as the TS path, apart from the data-source note", async () => {
    const note = (h: string) => h.replace(/<p class="note">[^<]*<\/p>/, "<p-note/>").replace(/(standings \().*?(\)<\/caption>)/, "$1note$2");
    expect((await render("generated")).map(note)).toEqual((await render("ts")).map(note));
  });
  it("the dev path says Sample data", async () => {
    const [standings, results] = await render("ts");
    expect(standings).toContain('<p class="note">Sample data</p>');
    expect(results).toContain('<p class="note">Sample data</p>');
  });
  it.skipIf(!haveGenerated)("the generated path says what meta.json says", async () => {
    const meta = JSON.parse(readFileSync("src/data/generated/meta.json", "utf8"));
    const [standings, results] = await render("generated");
    for (const html of [standings, results]) expect(html).toContain(`<p class="note">${describeSource(meta)}</p>`);
    expect(standings).toContain(`Serie A standings (${describeSource(meta)})`);
  });
});
