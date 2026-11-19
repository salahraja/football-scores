import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Home's first paint (look audit 2026-11-18): the poster's sizes are worked out for Barlow Condensed (0.47 em a letter), but the app
// pages never asked for the font early, so the first frame drew the poster in the phone's wide fallback (iOS has no Arial Narrow):
// "SERIE" and "A" on two lines, the score over "FIORENTINA", "JUVENT" cut off. The league pages already preload it; the app pages must too.
describe("the app pages' head", () => {
  const head = readFileSync("src/layouts/Page.astro", "utf8");
  it("preloads the poster's font, so the first frame is drawn in it", () => {
    expect(head).toContain('<link rel="preload" href="/fonts/barlow-condensed-800-latin.woff2" as="font" type="font/woff2" crossorigin />');
  });
});
