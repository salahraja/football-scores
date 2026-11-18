import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// "Brighter" (Salah, 2026-11-18): the light pages' red text read dark next to golboard's red. Light mode now uses the brighter red that
// dark mode, the built pages and the icon already use (#c4302a, 5.2:1 on the card). The see-through red panel on Home keeps its own red.
const app = readFileSync("src/styles/tokens.css", "utf8");
const built = readFileSync("scripts/api/pages.mjs", "utf8");
const lightRoot = (css: string) => css.slice(0, css.indexOf("@media (prefers-color-scheme: dark)"));

describe("the red", () => {
  it("is the brighter red in light mode, on the app and on the built pages", () => {
    expect(lightRoot(app)).toMatch(/--accent: #c4302a;/);
    expect(built.match(/:root \{[^}]*\}/)![0]).toMatch(/--accent: #c4302a;/);
  });

  it("is one red in light and dark, so the pages do not change shade with the system setting", () => {
    expect(app).not.toMatch(/--accent: #b3261e/);
    expect(built).not.toMatch(/--accent: #b3261e/);
  });

  it("leaves the see-through panel on Home as it was", () => {
    expect(app).toMatch(/--glass-red: rgb\(179 38 30 \/ 74%\);/);
  });
});
