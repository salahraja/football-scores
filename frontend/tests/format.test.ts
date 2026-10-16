import { describe, expect, it } from "vitest";
import { ageText, chipTitle, liveLabel, parseForm, phase, scoreNote, scoreText } from "../src/format";

describe("score formatter", () => {
  it("shows a plain score and a dash when there is none", () => {
    expect(scoreText({ home: 2, away: 1, duration: "REGULAR" })).toBe("2–1");
    expect(scoreText({ home: null, away: null, duration: "REGULAR" })).toBe("–");
    expect(scoreNote({ home: 2, away: 1, duration: "REGULAR" })).toBeNull();
  });
  it("marks extra time as AET", () => {
    expect(scoreNote({ home: 2, away: 1, duration: "EXTRA_TIME" })).toBe("AET");
  });
  it("shows the shootout beside the level score", () => {
    const score = { home: 1, away: 1, duration: "PENALTY_SHOOTOUT" as const, penalties: { home: 6, away: 5 } };
    expect(scoreText(score)).toBe("1–1");
    expect(scoreNote(score)).toBe("AET, pens 6-5");
  });
});

describe("live label", () => {
  it("gives minute, injury time, half time", () => {
    expect(liveLabel({ status: "IN_PLAY", minute: 67 })).toBe("67'");
    expect(liveLabel({ status: "IN_PLAY", minute: 90, injuryTime: 3 })).toBe("90+3'");
    expect(liveLabel({ status: "PAUSED" })).toBe("HT");
    expect(liveLabel({ status: "IN_PLAY" })).toBe("Live");
  });
  it("classifies statuses", () => {
    expect(phase("IN_PLAY")).toBe("live");
    expect(phase("FINISHED")).toBe("finished");
    expect(phase("TIMED")).toBe("upcoming");
    expect(phase("POSTPONED")).toBe("off");
  });
});

describe("form chips", () => {
  it("parses the table's form string", () => {
    expect(parseForm("W,D,L,W,W").map((i) => i.result)).toEqual(["W", "D", "L", "W", "W"]);
    expect(parseForm(null)).toEqual([]);
  });
  it("says won or lost on pens for a shootout draw", () => {
    expect(chipTitle({ result: "D", shootout: "W" })).toBe("Draw, won on pens");
    expect(chipTitle({ result: "D", shootout: "L" })).toBe("Draw, lost on pens");
    expect(chipTitle({ result: "D" })).toBe("Draw");
  });
});

describe("age", () => {
  it("counts in minutes, at least one", () => {
    expect(ageText(20)).toBe("1 minute old");
    expect(ageText(12 * 60)).toBe("12 minutes old");
  });
});
