import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Salah, 2026-11-17, on his iPhone: a light bar sat above the page, Safari's own strip under the status bar. The app's pages run edge to
// edge like the league pages (scripts/api/pages.mjs already does), so the slate poster reaches the top of the screen, and the menu and the
// poster pad themselves by the status bar's height.
const layout = readFileSync("src/layouts/Page.astro", "utf8");
const css = readFileSync("src/styles/base.css", "utf8");
const rule = (sel: string) => [...css.matchAll(new RegExp(`(^|\\n)${sel.replace(".", "\\.")} \\{([^}]*)\\}`, "g"))].map((m) => m[2]).join("\n");

// Then: "Etsy and eBay have no top strip, it's there but it's transparent". Safari fills the strip with the background of a sticky bar at the
// top of the page, so the menu itself has no background; its glass is a layer inside it (::before), which Safari does not copy.
const pages = readFileSync("scripts/api/pages.mjs", "utf8");
describe("Safari has no colour to copy into the strip", () => {
  it("the app's menu is transparent, its glass drawn inside it", () => {
    expect(rule(".navbar")).not.toMatch(/(^|[\s;])background:/);
    expect(rule(".navbar::before")).toMatch(/background:\s*var\(--glass-fill\)/);
    expect(rule(".navbar::before")).toMatch(/backdrop-filter:\s*saturate/);
  });
  it("the league pages' menu too", () => {
    const nav = [...pages.matchAll(/(^|\n)\.nav \{([^}]*)\}/g)].map((m) => m[2]).join("\n");
    expect(nav).not.toMatch(/(^|[\s;])background:/);
    expect(pages).toMatch(/\.nav::before \{[^}]*background:\s*var\(--glass\)/);
  });
});

describe("the app's pages run under the status bar", () => {
  it("asks for the whole screen", () => {
    expect(layout).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover/);
  });
  it("keeps the menu below the status bar", () => {
    expect(rule(".navbar")).toMatch(/top:\s*calc\(12px \+ env\(safe-area-inset-top, 0px\)\)/);
    expect(rule(".navbar")).toMatch(/margin:\s*calc\(12px \+ env\(safe-area-inset-top, 0px\)\) auto 0/);
  });
  it("lets the poster reach the top of the screen and keeps its content clear", () => {
    const poster = rule(".poster");
    expect(poster).toMatch(/margin-top:\s*calc\(-76px - env\(safe-area-inset-top, 0px\)\)/);
    expect(poster).toMatch(/padding-top:\s*calc\(88px \+ env\(safe-area-inset-top, 0px\)\)/);
  });
});

// Then "It's not see through" (after #60 went live): Safari 26 ignores theme-color and takes the strip's colour from the body's background
// unless a fixed or sticky bar at the top has a solid colour of its own (WebKit bug 301756). The body was the page's off-white (#eeeeec)
// while Home starts with the slate poster, so the strip stood out. On a page that opens with the poster, the body is the poster's slate.
describe("Safari's strip takes the colour of the top of the page", () => {
  it("on a page with the poster, the body is the poster's slate", () => {
    expect(css).toMatch(/html:has\(\.poster\),\s*html:has\(\.poster\) body\s*\{[^}]*background-color:\s*var\(--slate\)/);
  });
});
