import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Salah, 2026-11-25: Home's parallax (the poster held still while the sheet slides up over it) is there on the iPhone Duo's inner
// screen and gone on its outer one. The inner screen is wider than 760px, so it keeps the sticky poster; the outer one (382px) is a
// phone, where the poster stopped being sticky on 11-08 because Safari clipped a sticky layer at its address bar. On phones the poster
// now stays in the page and is moved down as fast as the page scrolls (a scroll-driven transform), so it looks held without being
// sticky. Only where the browser has scroll timelines and the reader has not asked for less motion.
const css = readFileSync("src/styles/base.css", "utf8");

describe("the poster holds still on phones too", () => {
  it("keeps the phone poster out of sticky positioning (Safari clips a sticky layer at its bar)", () => {
    expect(css).toMatch(/@media \(max-width: 760px\) and \(pointer: coarse\) \{\s*\.poster \{ position: relative;/);
  });

  it("moves the phone poster down with the scroll, as far as its own height, behind the sheet", () => {
    const block = css.slice(css.indexOf("/* the phone poster's parallax"));
    expect(block).toMatch(/@supports \(animation-timeline: scroll\(\)\)/);
    expect(block).toMatch(/@media \(max-width: 760px\) and \(pointer: coarse\) and \(prefers-reduced-motion: no-preference\)/);
    expect(block).toMatch(/\.poster \{ animation: poster-hold linear both; animation-timeline: scroll\(root\); animation-range: 0 calc\(100lvh \+ 120px\); \}/);
    expect(block).toMatch(/@keyframes poster-hold \{ to \{ transform: translateY\(calc\(100lvh \+ 120px\)\); \} \}/);
  });
});
