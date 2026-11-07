import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NavBar from "../src/components/NavBar.vue";

// The glass nav carries the three pages only (Salah, 2026-10-30: remove "By" with my avatar). Since the move to Astro
// (Salah, 2026-11-07) each page is its own built page, so the nav is plain links and marks the page you are on.
describe("navbar", () => {
  it("links the three pages and carries no byline or avatar", () => {
    const nav = mount(NavBar, { props: { current: "/" } });
    expect(nav.findAll("a").map((a) => a.attributes("href"))).toEqual(["/", "/standings", "/results", "/leagues/"]);
    expect(nav.find("img").exists()).toBe(false);
    expect(nav.text()).not.toMatch(/\bBy\b/);
  });

  it("links the league pages, which are built outside the app", () => {
    expect(mount(NavBar).find('a[href="/leagues/"]').text()).toBe("Leagues");
  });

  it("marks the current page, and only that one", () => {
    const nav = mount(NavBar, { props: { current: "/standings" } });
    expect(nav.findAll('[aria-current="page"]').map((a) => a.text())).toEqual(["League Table"]);
  });
});
