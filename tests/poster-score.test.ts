import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The poster's lettering, as Salah settled it on 2026-11-13:
//  - "I want the design on 2-2 to be the one we follow" and "our signature look is a large block like this" (LALIGA on the live site,
//    after PR #45): the display face at its NATURAL shape. No tall stretch on the name, no added outline, natural spacing.
//  - "maybe we make the red score elongated so there's less empty space": the score alone is drawn taller, by as much as the empty
//    poster above it allows (HomeView measures the gap and sets --tall), up to a cap.
const css = readFileSync("src/styles/base.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, ""); // comments out: they hold commas and would hide a selector
const view = readFileSync("src/views/HomeView.vue", "utf8");
const rulesFor = (selector: string) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, sel]) => sel.split(",").some((s) => s.trim() === selector)).map(([, , body]) => body).join(" ");
const last = (body: string, prop: string) => [...body.matchAll(new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+);`, "g"))].pop()?.[1]?.trim();

describe("the poster's lettering", () => {
  const name = rulesFor(".poster__title"), score = rulesFor(".poster__score");

  it("the league's name is the plain block: not stretched tall, no added outline", () => {
    expect(name).not.toContain("scaleY");
    expect(name).not.toContain("text-stroke");
    expect(view).not.toContain("--stretch");
  });

  it("the score has no added outline either, and the same spacing as the name", () => {
    expect(score).not.toContain("text-stroke");
    expect(last(score, "letter-spacing") ?? "normal").toBe(last(name, "letter-spacing") ?? "normal");
  });

  it("the score is drawn taller into the empty poster above it, and the layout is told", () => {
    expect(score).toContain("scaleY(var(--tall, 1))");
    expect(view).toMatch(/setProperty\("--tall"/);
  });

  it("the score is never made more than about half again as tall", () => {
    const cap = Number(/const TALLEST = ([\d.]+)/.exec(view)?.[1]);
    expect(cap).toBeGreaterThan(1);
    expect(cap).toBeLessThanOrEqual(1.6);
  });

  it("both are the same face and weight", () => {
    expect(name).toMatch(/font:\s*800 [^;]*var\(--font-display\)/);
    expect(score).toMatch(/font:\s*800 [^;]*var\(--font-display\)/);
  });
});
