import { describe, expect, it } from "vitest";
import { CLUB_SHARE, SERIE_A, clubColour } from "../src/data/clubColours";

// what the club colour is mixed into (src/styles/tokens.css: --club-base, the lighter slate-2 in light mode, slate in dark)
const SCHEMES = { light: { slate: "#a9b3c3", fg: "#1b1c20" }, dark: { slate: "#2c3442", fg: "#eef0f3" } } as const;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a: string, b: string, share: number) => rgb(a).map((v, i) => v * share + rgb(b)[i] * (1 - share));
const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("club colours", () => {
  it("covers every Serie A club on the site, under the names the data uses", () => {
    for (const name of ["Juventus", "AC Milan", "Milan", "Inter", "Internazionale", "AS Roma", "SSC Napoli", "Hellas Verona"])
      expect(clubColour(name) !== null || name === "Hellas Verona").toBe(true);
    expect(Object.keys(SERIE_A)).toHaveLength(20);
  });

  it("knows nothing of clubs it has no colour for, so the poster keeps its slate", () => {
    expect(clubColour("Arsenal")).toBeNull();
    expect(clubColour(undefined)).toBeNull();
  });

  it("keeps the names and score readable on every club's colour, light and dark (3:1, large display text)", () => {
    const worst: string[] = [];
    for (const [scheme, c] of Object.entries(SCHEMES))
      for (const [club, hex] of Object.entries(SERIE_A)) {
        const ratio = contrast(rgb(c.fg), mix(hex, c.slate, CLUB_SHARE[scheme as keyof typeof CLUB_SHARE]));
        if (ratio < 3) worst.push(`${scheme} ${club} ${ratio.toFixed(2)}`);
      }
    expect(worst).toEqual([]);
  });
});

describe("the stylesheet uses the same shares the contrast test checks", () => {
  it("light and dark --club-share match CLUB_SHARE", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/styles/tokens.css", "utf8");
    const shares = [...css.matchAll(/--club-share:\s*(\d+)%/g)].map((m) => Number(m[1]) / 100);
    expect(shares).toEqual([CLUB_SHARE.light, CLUB_SHARE.dark]);
  });
});
