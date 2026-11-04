import { mount, RouterLinkStub } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NavBar from "../src/components/NavBar.vue";

// The glass nav carries the three pages only (Salah, 2026-10-30: remove "By" with my avatar).
describe("navbar", () => {
  it("links the three pages and carries no byline or avatar", () => {
    const nav = mount(NavBar, { global: { stubs: { RouterLink: RouterLinkStub } } });
    expect(nav.findAllComponents(RouterLinkStub).map((l) => l.props("to"))).toEqual(["/", "/standings", "/results"]);
    expect(nav.find("img").exists()).toBe(false);
    expect(nav.text()).not.toMatch(/\bBy\b/);
  });
});
