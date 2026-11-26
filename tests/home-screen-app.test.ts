// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { pages } from "../scripts/api/pages.mjs";

// Salah, 2026-11-25, on the iPhone Duo's outer screen: "I want to have the side bar removed". The side strip is Safari's own; no page can
// hide it in the browser. Opened from the Home Screen as a web app (display: standalone), golboard runs with no Safari bar or strip.
const dirs: string[] = [];
afterAll(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const png = (path: string) => { const b = readFileSync(join("public", path)); return { sig: b.subarray(1, 4).toString("ascii"), w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const HEAD = [/<link rel="manifest" href="\/manifest\.webmanifest"/, /<meta name="apple-mobile-web-app-capable" content="yes"/,
  /<meta name="mobile-web-app-capable" content="yes"/, /<meta name="apple-mobile-web-app-title" content="golboard"/];

describe("golboard as a home-screen app", () => {
  it("has a manifest that opens it on its own, without the browser's bars", () => {
    const m = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
    expect(m).toMatchObject({ name: "golboard", short_name: "golboard", start_url: "/", scope: "/", display: "standalone" });
    expect(m.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/icon-192.png", sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ src: "/icon-512.png", sizes: "512x512", type: "image/png" }),
    ]));
    expect(png("icon-192.png")).toEqual({ sig: "PNG", w: 192, h: 192 });
    expect(png("icon-512.png")).toEqual({ sig: "PNG", w: 512, h: 512 });
  });

  it("every Astro page links it and asks iOS for a full-screen web app", () => {
    const layout = readFileSync("src/layouts/Page.astro", "utf8");
    for (const re of HEAD) expect(layout).toMatch(re);
  });

  it("every built league page does too", () => {
    const out = mkdtempSync(join(tmpdir(), "golboard-app-")); dirs.push(out);
    build({ input: "tests/fixtures/openfootball", wikipedia: out + "/w", espn: out + "/e", out, seasons: ["2025-26"], now: "2026-10-31T17:00:00Z" });
    pages({ api: join(out, "api/v1"), out });
    const html = readFileSync(join(out, "leagues/it-1/index.html"), "utf8");
    for (const re of HEAD) expect(html).toMatch(re);
  });
});
