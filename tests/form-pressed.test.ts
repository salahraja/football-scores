import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Salah, 2026-11-14: "Maybe we have the W, L, D buttons be given a look of being pushed downwards". The form badges are pressed into the
// card: a shadow inside at the top, light catching the lower lip, the letter set in with a dark edge above it.
const css = readFileSync("scripts/api/pages.mjs", "utf8");
const rule = /\.form li \{([^}]*)\}/.exec(css)?.[1] ?? "";

describe("the form badges look pressed in", () => {
  it("cast their shadow inward from the top", () => expect(rule).toMatch(/box-shadow:[^;]*inset 0 2px/));
  it("catch light on the lip below", () => expect(rule).toMatch(/box-shadow:[^;]*0 1px 0 rgb\(255 255 255/));
  it("set the letter into the surface", () => expect(rule).toMatch(/text-shadow: 0 -1px 0 rgb\(0 0 0/));
});
