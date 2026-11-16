import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mount } from "@vue/test-utils";
import { afterAll, describe, expect, it } from "vitest";
import NavBar from "../src/components/NavBar.vue";
import { build } from "../scripts/api/build.mjs";
import { pages } from "../scripts/api/pages.mjs";

// One menu on every page (Salah, 2026-11-15: "menubar items disappear based on pages you're on, it's not consistent"): Home, Leagues,
// News, Following, in that order, on the app's pages and the built league pages alike. League Table and Match Results stay linked
// from Home ("Full table", "All results"); the league pages' Table / This week jumps are gone from the menu.
const MENU = ["/", "/leagues/", "/news/", "/following/"];
const dirs: string[] = [];
afterAll(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe("navbar", () => {
  it("is the same four links on the app's pages, with no byline or avatar", () => {
    const nav = mount(NavBar, { props: { current: "/" } });
    expect(nav.findAll("a").map((a) => a.attributes("href"))).toEqual(MENU);
    expect(nav.findAll("a").map((a) => a.text())).toEqual(["Home", "Leagues", "News", "Following"]);
    expect(nav.find("img").exists()).toBe(false);
    expect(nav.text()).not.toMatch(/\bBy\b/);
  });

  it("marks the current page, and only that one", () => {
    const nav = mount(NavBar, { props: { current: "/" } });
    expect(nav.findAll('[aria-current="page"]').map((a) => a.text())).toEqual(["Home"]);
  });

  it("is the same four links on every built page, whatever the page", () => {
    const out = mkdtempSync(join(tmpdir(), "golboard-nav-")); dirs.push(out);
    const wiki = mkdtempSync(join(tmpdir(), "golboard-nav-w-")); dirs.push(wiki);
    build({ input: "tests/fixtures/openfootball", wikipedia: wiki, out, seasons: ["2025-26"], now: "2026-10-31T17:00:00Z" });
    pages({ api: join(out, "api/v1"), out });
    for (const path of ["leagues/index.html", "leagues/it-1/index.html", "news/index.html", "following/index.html"]) {
      const html = readFileSync(join(out, path), "utf8");
      const nav = /<nav class="nav"[^>]*>([\s\S]*?)<\/nav>/.exec(html)![1];
      expect([...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1]), path).toEqual(MENU);
    }
  });
});
