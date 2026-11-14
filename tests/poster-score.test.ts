import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The poster's lettering, as Salah settled it on 2026-11-13:
//  - "our signature look is a large block like this" (the league's name): heavy block capitals. The display face with a heavier
//    outline and slightly wider spacing, at its natural proportions: NOT stretched tall (the tall stretch of 11-07 made long names skinny).
//  - the name and the score "need to consistently look the same": the score carries the same outline and spacing.
//  - "maybe we make the red score elongated so there's less empty space": the score alone is drawn taller, by as much as the empty
//    poster above it allows (HomeView measures the gap and sets --tall), up to a cap.
const css = readFileSync("src/styles/base.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, ""); // comments out: they hold commas and would hide a selector
const view = readFileSync("src/views/HomeView.vue", "utf8");
const rulesFor = (selector: string) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, sel]) => sel.split(",").some((s) => s.trim() === selector)).map(([, , body]) => body).join(" ");
const last = (body: string, prop: string) => [...body.matchAll(new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+);`, "g"))].pop()?.[1]?.trim();

describe("the poster's lettering", () => {
  const name = rulesFor(".poster__title"), score = rulesFor(".poster__score");

  it("the league's name is a heavy block: outlined, and not stretched tall", () => {
    expect(last(name, "-webkit-text-stroke")).toBe("0.038em var(--accent)");
    expect(name).not.toContain("scaleY");
    expect(view).not.toContain("--stretch");
  });

  it("the score has the same outline and spacing as the name", () => {
    expect(last(score, "-webkit-text-stroke")).toBe(last(name, "-webkit-text-stroke"));
    expect(last(score, "letter-spacing")).toBe(last(name, "letter-spacing"));
    expect(last(score, "paint-order")).toBe("stroke fill");
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
