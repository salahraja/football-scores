import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Home's first paint, part 2 (look audit 2026-11-18): until Barlow Condensed arrives, the poster is set in a fallback. iOS has no Arial
// Narrow, so that was the system sans, 1.4 times as wide (measured 2026-11-20 in WebKit: 4,823 px against Barlow's 3,436 for the same
// line). Fallback faces from fonts the phones already have, each scaled (size-adjust) to Barlow's width, keep the first frame's layout.
const base = readFileSync("src/styles/base.css", "utf8");
const tokens = readFileSync("src/styles/tokens.css", "utf8");

describe("the display font's fallbacks", () => {
  it.each([
    ["Barlow fallback HN", "Helvetica Neue Condensed Bold", "89.7%"],
    ["Barlow fallback AN", "Avenir Next Condensed Bold", "90.8%"],
    ["Barlow fallback Arial", "Arial Narrow Bold", "86.9%"],
  ])("%s is %s scaled to Barlow's width", (family, local, adjust) => {
    const face = base.split("@font-face").find((f) => f.includes(`"${family}"`));
    expect(face, family).toBeDefined();
    expect(face).toContain(`local("${local}")`);
    expect(face).toContain(`size-adjust: ${adjust}`);
  });

  it("lists them after Barlow and before the system sans", () => {
    const display = /--font-display:\s*([^;]+);/.exec(tokens)![1];
    expect(display.trim()).toBe('"Barlow Condensed", "Barlow fallback HN", "Barlow fallback AN", "Barlow fallback Arial", sans-serif');
  });
});
