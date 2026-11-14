import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Salah, 2026-11-13: "see how the score looks different from Serie A? Those both need to consistently look the same."
// The league's name is drawn tall (a vertical stretch, set per league by HomeView) with a heavier outline and wider spacing.
// The score was drawn plain, so it looked wide and thin beside it. They must share one look, on every league.
const css = readFileSync("src/styles/base.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, ""); // comments out: they hold commas and would hide a selector
const view = readFileSync("src/views/HomeView.vue", "utf8");
const rulesFor = (selector: string) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, sel]) => sel.split(",").some((s) => s.trim() === selector)).map(([, , body]) => body).join(" ");

describe("the poster's score looks like the league's name", () => {
  it("has the same outline and letter spacing as the name", () => {
    const name = rulesFor(".poster__title"), score = rulesFor(".poster__score");
    const stroke = /-webkit-text-stroke:\s*([^;]+);/.exec(name)?.[1];
    const spacing = [...name.matchAll(/letter-spacing:\s*([^;]+);/g)].pop()?.[1];
    expect(stroke).toBeTruthy();
    expect(score).toContain(`-webkit-text-stroke: ${stroke}`);
    expect(score).toContain(`letter-spacing: ${spacing}`);
    expect(score).toContain("paint-order: stroke fill");
  });

  it("is stretched tall by the same amount as the name", () => {
    expect(rulesFor(".poster__title")).toContain("scaleY(var(--stretch, 1))");
    expect(rulesFor(".poster__score")).toContain("scaleY(var(--stretch, 1))");
  });

  it("gets narrower as it gets taller, so it keeps the height the layout gave it", () => {
    expect(rulesFor(".poster__score")).toMatch(/font-size:\s*calc\(var\(--score\)\s*\/\s*var\(--stretch, 1\)\)/);
  });

  it("is told the stretch: HomeView sets it on the whole poster, not on the name alone", () => {
    expect(view).toMatch(/closest\("\.poster"\)/);
  });
});
