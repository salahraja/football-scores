import { describe, expect, it } from "vitest";
import { teamCalendars } from "../scripts/api/calendar.mjs";

// Salah, 2026-11-14: a calendar feed per team. One .ics per team, every competition it plays in, kick-offs in UTC so any phone shows
// them in its own time. No scores in the titles: a calendar is for when, and spoiler-free matters to people who watch later.
const game = (over: Record<string, unknown>) => ({ id: "it-1:2026-11-22:juventus-inter", round: "13", stage: "league", date: "2026-11-22",
  time: "20:45", kickoff: "2026-11-22T20:45:00+01:00", home: "juventus", away: "inter", status: "scheduled", score: null, source: "openfootball", ...over });
const current = new Map<string, { matches: Record<string, unknown>[]; teams: Record<string, string> }>([
  ["it-1", { matches: [game({}), game({ id: "it-1:2026-05-01:juventus-roma", date: "2026-05-01", away: "roma", status: "finished", score: { ft: [2, 1] } })],
    teams: { juventus: "Juventus", inter: "Inter", roma: "Roma" } }],
  ["uefa-champions-league", { matches: [game({ id: "ucl:1", date: "2026-11-25", time: null, kickoff: null, away: "psg" })],
    teams: { juventus: "Juventus", psg: "Paris Saint-Germain, FC" } }],
]);
const names = { "it-1": "Serie A", "uefa-champions-league": "Champions League" };
const build = () => teamCalendars({ current, names, now: "2026-11-14T10:00:00Z", site: "https://golboard.test" });

describe("team calendars", () => {
  it("writes one feed per team with every competition it plays in", () => {
    const files = build();
    expect([...files.keys()].sort()).toContain("api/v1/calendar/juventus.ics");
    const ics = files.get("api/v1/calendar/juventus.ics")!;
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
    expect(ics).toContain("X-WR-CALNAME:Juventus · golboard");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });

  it("gives a kick-off in UTC, two hours long, with the competition, and a stable id", () => {
    const ics = build().get("api/v1/calendar/inter.ics")!;
    expect(ics).toContain("DTSTART:20261122T194500Z");
    expect(ics).toContain("DTEND:20261122T214500Z");
    expect(ics).toContain("SUMMARY:Juventus v Inter");
    expect(ics).toContain("UID:it-1:2026-11-22:juventus-inter@golboard");
    expect(ics).toMatch(/DESCRIPTION:Serie A/);
  });

  it("makes a game with no time an all-day event, and escapes commas in names", () => {
    const ics = build().get("api/v1/calendar/psg.ics")!;
    expect(ics).toContain("DTSTART;VALUE=DATE:20261125");
    expect(ics).toContain("SUMMARY:Juventus v Paris Saint-Germain\\, FC");
  });

  it("never puts a score in a title", () => {
    const ics = build().get("api/v1/calendar/roma.ics")!;
    expect(ics).toContain("SUMMARY:Juventus v Roma");
    expect(ics).not.toMatch(/2[–-]1/);
  });
});

describe("the build", () => {
  it("publishes a calendar for every team beside the JSON", async () => {
    const { build } = await import("../scripts/api/build.mjs");
    const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const out = mkdtempSync(join(tmpdir(), "golboard-cal-"));
    try {
      build({ input: "tests/fixtures/openfootball", out, seasons: ["2025-26"], now: "2026-10-31T03:00:00Z" });
      const ics = readFileSync(join(out, "api/v1/calendar/inter.ics"), "utf8");
      expect(ics).toContain("X-WR-CALNAME:Inter");
      expect(ics).toMatch(/DESCRIPTION:Serie A/);
    } finally { rmSync(out, { recursive: true, force: true }); }
  });
});

describe("the club page", () => {
  it("offers its calendar as a webcal subscription", async () => {
    const { build } = await import("../scripts/api/build.mjs");
    const { pages } = await import("../scripts/api/pages.mjs");
    const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const out = mkdtempSync(join(tmpdir(), "golboard-calp-")), wiki = mkdtempSync(join(tmpdir(), "golboard-calw-"));
    try {
      build({ input: "tests/fixtures/openfootball", wikipedia: wiki, out, seasons: ["2025-26"], now: "2026-10-31T17:00:00Z" });
      pages({ api: join(out, "api/v1"), out });
      const html = readFileSync(join(out, "leagues/it-1/inter/index.html"), "utf8");
      expect(html).toMatch(/<a class="calendar" href="webcal:\/\/[^"]+\/api\/v1\/calendar\/inter\.ics">Add games to my calendar<\/a>/);
    } finally { rmSync(out, { recursive: true, force: true }); rmSync(wiki, { recursive: true, force: true }); }
  });
});

describe("serving", () => {
  it("tells Netlify the feeds are calendars", async () => {
    const { writeHeaders } = await import("../scripts/csp.mjs");
    const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dist = mkdtempSync(join(tmpdir(), "golboard-hdr-"));
    try {
      writeHeaders(dist);
      expect(readFileSync(join(dist, "_headers"), "utf8")).toContain("/api/v1/calendar/*\n  Content-Type: text/calendar; charset=utf-8\n");
    } finally { rmSync(dist, { recursive: true, force: true }); }
  });
});
