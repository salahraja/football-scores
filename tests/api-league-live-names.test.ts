import { describe, expect, it } from "vitest";
import { liveScript } from "../scripts/api/pages.mjs";
import { teamId } from "../scripts/api/teams.mjs";
import { unknownNames } from "../scripts/api/check-live-names.mjs";
import { teamId as homeTeamId } from "../src/data/clubid";

// A live score is written into the row with the same two teams. When the live feed names a club in a way we do not know, that club's
// scores never show. The cups' names were checked on 14 November 2026 (tests/api-cup-live.test.ts); the leagues' never were, and on
// 17 November 2026 a read of SportScore's fixtures for 30 October to 9 November found four clubs, all promoted this season, whose name
// in the feed made a different id from ours. These are every league name that did not already match.
const browserTeamId = () => {
  const win = { document: { querySelectorAll: () => [] } } as never;
  return new Function("window", "document", `${liveScript()}; return window.golboardLive;`)(win, (win as { document: unknown }).document).teamId;
};

describe("SportScore's names for the league clubs", () => {
  it.each([
    ["RC Deportivo", "deportivo-coruna"],        // LaLiga
    ["Havre Athletic Club", "le-havre"],         // Ligue 1
    ["Troyes", "es-troyes"],                     // Ligue 1
    ["Excelsior SBV", "excelsior"],              // Eredivisie
  ])("%s is our %s, in the build, on the league pages and on the homepage", (feed, ours) => {
    expect(teamId(feed)).toBe(ours);
    expect(browserTeamId()(feed)).toBe(ours);
    expect(homeTeamId(feed)).toBe(ours);
  });

  it("leaves the clubs they could be mistaken for alone", () => {
    expect(teamId("Deportivo Alavés")).toBe("alaves");
    expect(teamId("Le Havre AC")).toBe("le-havre");
    expect(teamId("Excelsior Maassluis")).toBe("excelsior-maassluis");
  });
});

describe("unknownNames: which of the feed's names are not a team of ours", () => {
  const ours = { "le-havre": "Le Havre", lens: "Lens" };
  it("lists a name whose id is not one of the league's teams, with the id it made", () => {
    expect(unknownNames(["Lens", "RC Lens", "Testville Rovers"], ours, teamId, /\bisrael/i)).toEqual([{ name: "Testville Rovers", id: "testville-rovers" }]);
  });
  it("never lists a team that is hidden on purpose", () => {
    expect(unknownNames(["Israel", "Lens"], ours, teamId, /\bisrael/i)).toEqual([]);
  });
});
