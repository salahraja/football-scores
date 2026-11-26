import { mount, RouterLinkStub } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomeView from "../src/views/HomeView.vue";

// Salah, 2026-11-25, on the iPhone Duo's outer screen: brown edges, "also the bar is brown based on our gradient even if you change
// fixtures". He chose to keep the bar in the shown game's club colours. Safari paints its bar (and, on a wide screen, its side strip)
// from the body's background colour, read when the page loads; a swipe changed only the CSS variables under it, so Safari kept the
// first game's colour. Now each change of game writes the resolved colour onto the body itself and into theme-color. And the body's
// own colour stays at the top of the page: below the poster it is the page's background, so no club colour shows round the sheet.
const css = readFileSync("src/styles/base.css", "utf8");

describe("Safari's bar follows the shown game", () => {
  afterEach(() => { vi.restoreAllMocks(); document.body.removeAttribute("style"); document.querySelector('meta[name="theme-color"]')?.remove(); });

  it("writes the resolved top colour onto the body and into theme-color, again on every change of game", async () => {
    // jsdom does not resolve color-mix; stand in for the browser: the body's colour follows the root's --home-c
    const real = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
      const style = real(el, pseudo);
      if (el !== document.body) return style;
      const home = document.documentElement.style.getPropertyValue("--home-c");
      return { ...style, backgroundColor: home ? `rgb(${parseInt(home.slice(1, 3), 16)}, 0, 0)` : "rgb(111, 126, 152)" } as CSSStyleDeclaration;
    });
    const w = mount(HomeView, { global: { stubs: { RouterLink: RouterLinkStub } }, attachTo: document.body });
    await w.vm.$nextTick();
    const meta = () => document.querySelector('meta[name="theme-color"]')?.getAttribute("content");
    const first = document.body.style.backgroundColor;
    expect(first).toMatch(/^rgb\(/);
    expect(meta()).toBe(first);
    const next = w.find('[data-test="game-next"]');
    expect(next.exists()).toBe(true);  // the sample data has a week of games to step through
    {
      const seen = new Set([first]);
      for (let i = 0; i < 6; i++) { await next.trigger("click"); await w.vm.$nextTick(); seen.add(document.body.style.backgroundColor); expect(meta()).toBe(document.body.style.backgroundColor); }
      expect(seen.size).toBeGreaterThan(1);  // the sample week has games in different club colours
    }
    w.unmount();
    expect(document.body.style.backgroundColor).toBe("");  // leaving Home gives the body back to the stylesheet
  });
});

describe("no club colour round the sheet", () => {
  it("the body's top colour stops near the top of the page, not halfway down it", () => {
    const rule = css.match(/html:has\(\.poster\) body\s*\{[^}]*background-image:[^}]*\}/)![0];
    expect(rule).not.toMatch(/var\(--top\) 0 50%/);
    expect(rule).toMatch(/linear-gradient\(var\(--top\) 0 30lvh, var\(--bg\) 30lvh\)/);
  });
});
