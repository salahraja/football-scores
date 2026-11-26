import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Salah, 2026-11-26: "Give the selections a depressed button look." A chosen league, club, nation or player in the setup now looks
// pressed in, as the menu's current page does (src/styles/base.css .links a[aria-current="page"]): sunk shadows inside, the site's red
// text, no flat red fill. Light and dark each have their own shadows, as the menu has.
const vue = readFileSync("src/components/Onboarding.vue", "utf8");
const style = vue.slice(vue.indexOf("<style"));
const rule = (sel: RegExp) => style.match(new RegExp(`${sel.source}[^{]*\\{([^}]*)\\}`))?.[1] ?? "";

describe("the setup's chosen buttons look pressed in", () => {
  it("in light: sunk inside, red text, no red fill", () => {
    const r = rule(/\.chip\[aria-pressed="true"\], \.player\[aria-pressed="true"\]/);
    expect(r).toMatch(/box-shadow:\s*inset 0 3px 6px rgb\(0 0 0 \/ 28%\), inset 0 1px 2px rgb\(0 0 0 \/ 22%\), inset 0 -1px 1px rgb\(255 255 255 \/ 60%\)/);
    expect(r).toMatch(/color:\s*#c4302a/);
    expect(r).not.toMatch(/background:\s*var\(--accent\)/);
  });

  it("in dark: the menu's dark shadows", () => {
    const dark = style.slice(style.indexOf("@media (prefers-color-scheme: dark)"));
    expect(dark).toMatch(/\.chip\[aria-pressed="true"\], \.player\[aria-pressed="true"\] \{[^}]*box-shadow:\s*inset 0 3px 7px rgb\(0 0 0 \/ 65%\)/);
  });
});
