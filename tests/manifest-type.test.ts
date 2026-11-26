import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The home-screen app's manifest (public/manifest.webmanifest) went live as application/octet-stream on 2026-11-26; browsers expect
// application/manifest+json. Netlify's headers set it.
describe("the manifest's type", () => {
  it("Netlify serves it as a web app manifest", () => {
    const toml = readFileSync("netlify.toml", "utf8");
    expect(toml).toMatch(/\[\[headers\]\]\s*for = "\/manifest\.webmanifest"\s*\[headers\.values\]\s*Content-Type = "application\/manifest\+json"/);
  });
});
