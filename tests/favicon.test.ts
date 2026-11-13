// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { pages } from "../scripts/api/pages.mjs";

// Salah, 2026-11-12: "change the favicon ... create a logo much like how I created a football logo for Ranoo". The old icon was a black circle with a white
// triangle. The new one is the Golboard crest family: a shield with a G and a red ball (public/favicon.svg, an .ico for old browsers, a home-screen icon).
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-icon-")); dirs.push(d); return d; };
afterAll(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const file = (path: string) => readFileSync(join("public", path));

describe("the icon files", () => {
  it("favicon.svg is a square-viewBox SVG that needs no font and no script", () => {
    const svg = file("favicon.svg").toString("utf8");
    expect(svg).toMatch(/^<svg [^>]*xmlns='http:\/\/www\.w3\.org\/2000\/svg'/);
    const [, , w, h] = /viewBox='(\S+) (\S+) (\S+) (\S+)'/.exec(svg)!.slice(1).map(Number);
    expect(w).toBe(h);
    expect(svg).not.toMatch(/<text|<script|font-family|href=/i);
    expect(svg).toContain("#b3261e");  // the site's red, in the ball
  });

  it("favicon.ico holds 16, 32 and 48 pixel pictures", () => {
    const ico = file("favicon.ico");
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);   // an icon file
    const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + 16 * i] || 256).sort((a, b) => a - b);
    expect(sizes).toEqual([16, 32, 48]);
  });

  it("apple-touch-icon.png is a 180 pixel square PNG (the iPhone home-screen icon)", () => {
    const png = file("apple-touch-icon.png");
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);
  });

  it("the full crest is kept as a logo, in the ink and the red-band versions", () => {
    for (const name of ["brand/golboard-crest.svg", "brand/golboard-crest-red.svg"]) {
      const svg = file(name).toString("utf8");
      expect(svg).toContain("<title>Golboard crest</title>");
      expect(svg).not.toMatch(/<text|font-family/i);
    }
  });
});

describe("every page names the icons", () => {
  const LINKS = [`<link rel="icon" type="image/svg+xml" href="/favicon.svg">`, `<link rel="icon" href="/favicon.ico" sizes="48x48">`, `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`];

  it("the Astro pages", () => {
    const layout = readFileSync("src/layouts/Page.astro", "utf8");
    for (const link of LINKS) expect(layout.replace(/ ?\/>/g, ">")).toContain(link);
  });

  it("the generated league, news and following pages", () => {
    const out = tmp();
    build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), out, seasons: ["2025-26"], now: "2026-10-31T17:00:00Z" });
    pages({ api: join(out, "api/v1"), out });
    for (const path of ["leagues/index.html", "leagues/it-1/index.html", "news/index.html", "following/index.html"]) {
      const html = readFileSync(join(out, path), "utf8");
      for (const link of LINKS) expect(html, `${path} ${link}`).toContain(link);
    }
  });
});
