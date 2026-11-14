import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Salah, 2026-11-13: "see how the score looks different from Serie A? Those both need to consistently look the same."
// and then: "I want the design on 2-2 to be the one we follow". So the SCORE's look is the rule: the display face at its
// natural shape. The league's name used to be stretched tall, with a heavier outline and wider spacing (2026-11-07); that goes,
// on every league, so the name and the score are the same letters at two sizes.
const css = readFileSync("src/styles/base.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, ""); // comments out: they hold commas and would hide a selector
const view = readFileSync("src/views/HomeView.vue", "utf8");
const rulesFor = (selector: string) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, sel]) => sel.split(",").some((s) => s.trim() === selector)).map(([, , body]) => body).join(" ");
const last = (body: string, prop: string) => [...body.matchAll(new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+);`, "g"))].pop()?.[1]?.trim();

describe("the league's name on the poster looks like the score", () => {
  const name = rulesFor(".poster__title"), score = rulesFor(".poster__score");

  it("is not stretched: neither is drawn taller than the typeface makes it", () => {
    expect(name).not.toContain("scaleY");
    expect(score).not.toContain("scaleY");
    expect(view).not.toContain("--stretch");
  });

  it("has no added outline, like the score", () => {
    expect(name).not.toContain("text-stroke");
    expect(score).not.toContain("text-stroke");
  });

  it("is spaced like the score", () => {
    expect(last(name, "letter-spacing") ?? "normal").toBe(last(score, "letter-spacing") ?? "normal");
  });

  it("is the same face and weight as the score", () => {
    expect(name).toMatch(/font:\s*800 [^;]*var\(--font-display\)/);
    expect(score).toMatch(/font:\s*800 [^;]*var\(--font-display\)/);
  });
});
