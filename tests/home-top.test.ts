import { mount, RouterLinkStub } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import HomeView from "../src/views/HomeView.vue";

// Salah, 2026-11-18, on an iPhone: "The bar is back on home only. Also the gradient should be only on the top like it is here" (the
// Leagues page). Safari paints the strip under the status bar in the body's colour (WebKit bug 301756). Home's body was the slate,
// but its poster ran in the two clubs' colours, so on a coloured game the slate strip stood out as a bar. Now one colour, --top (the
// clubs' colours mixed into the slate, or the slate alone), is both the body's colour and the poster's top, and the poster fades from
// it to the page's own background near the top, like the league pages.
const css = readFileSync("src/styles/base.css", "utf8");

describe("Home's top: no bar under the status bar", () => {
  it("gives the body the poster's top colour, --top", () => {
    expect(css).toMatch(/html:has\(\.poster\),\s*html:has\(\.poster\) body\s*\{[^}]*background-color:\s*var\(--top\)/);
    expect(css).toMatch(/--top:\s*color-mix\(in srgb, color-mix\(in srgb, var\(--home-c, var\(--slate\)\), var\(--away-c, var\(--slate\)\)\) var\(--club-share\), var\(--slate\)\)/);
  });

  it("fades the poster from --top to the page near the top, with no side-to-side club gradient", () => {
    expect(css).toMatch(/\.poster > \.poster__club\s*\{[^}]*background:\s*linear-gradient\(180deg, var\(--top\)[^)]*, var\(--bg\) \d+%\)/);
    expect(css).not.toMatch(/linear-gradient\(90deg, color-mix\(in srgb, var\(--home-c\)/);
  });

  it("puts the shown game's club colours on the page root, so the body's --top matches the poster", async () => {
    const w = mount(HomeView, { global: { stubs: { RouterLink: RouterLinkStub } }, attachTo: document.body });
    await w.vm.$nextTick();
    const poster = w.find(".poster__club");
    if (poster.exists()) expect(document.documentElement.style.getPropertyValue("--home-c")).toBe((poster.element as HTMLElement).style.getPropertyValue("--home-c"));
    else expect(document.documentElement.style.getPropertyValue("--home-c")).toBe("");
    w.unmount();
    expect(document.documentElement.style.getPropertyValue("--home-c")).toBe("");
  });
});
