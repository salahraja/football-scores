import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

// Temporary (Salah, 2026-11-18: "add a temporary dark mode toggle", to compare the reds). Remove with public/theme-toggle.js and its two tags.
const script = readFileSync("public/theme-toggle.js", "utf8");
// Node 24 hides jsdom's localStorage (see tests/home-news.test.ts), so the page gets a plain stand-in.
const memory = new Map<string, string>();
const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, String(v)),
  removeItem: (k: string) => void memory.delete(k), clear: () => memory.clear() };

function load() {
  document.head.innerHTML = '<style>body { color: black; } @media (prefers-color-scheme: dark) { body { color: white; } }</style>';
  document.body.innerHTML = "";
  new Function(script)();
  document.dispatchEvent(new Event("DOMContentLoaded"));
}
const media = () => [...document.styleSheets[0].cssRules].find((r) => r instanceof CSSMediaRule) as CSSMediaRule;
const button = () => document.querySelector<HTMLButtonElement>("button.theme-toggle")!;

describe("the temporary theme switch", () => {
  beforeEach(() => { Object.defineProperty(window, "localStorage", { value: storage, configurable: true }); memory.clear(); load(); });

  it("starts by following the phone, and says so", () => {
    expect(button().textContent).toMatch(/Auto/);
    expect(media().media.mediaText).toMatch(/prefers-color-scheme: dark/);
  });

  it("goes light, then dark, then back to the phone's setting", () => {
    button().click();
    expect(button().textContent).toMatch(/Light/);
    expect(media().media.mediaText).toBe("not all");
    button().click();
    expect(button().textContent).toMatch(/Dark/);
    expect(media().media.mediaText).toBe("all");
    button().click();
    expect(media().media.mediaText).toMatch(/prefers-color-scheme: dark/);
  });

  it("remembers the choice on the next page", () => {
    button().click(); button().click();
    load();
    expect(button().textContent).toMatch(/Dark/);
    expect(media().media.mediaText).toBe("all");
  });

  it("is on the app pages and on the built pages", () => {
    expect(readFileSync("src/layouts/Page.astro", "utf8")).toMatch(/<script is:inline src="\/theme-toggle\.js" defer><\/script>/);
    expect(readFileSync("scripts/api/pages.mjs", "utf8")).toMatch(/<script src="\/theme-toggle\.js" defer><\/script>/);
  });
});
