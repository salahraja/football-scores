import { describe, expect, it } from "vitest";
import { teamId } from "../src/data/clubid";

// One club, one id, whatever a source calls it: the same rule as scripts/api/teams.mjs, so a club on the homepage (named by football-data, SportScore or
// the site's own API) is the same club the Following star and the news file name. The names below are the homepage's real Serie A feed on 2026-11-12,
// and the ids are the site's API for that league.
const FEED = ["Lazio", "Inter", "Roma", "Milan", "Como 1907", "Frosinone", "Juventus", "Bologna", "Cagliari", "Napoli", "Atalanta", "Torino", "Genoa", "Lecce",
  "Fiorentina", "Parma", "Sassuolo", "Monza", "Venezia FC", "Udinese"];
const API = ["atalanta", "bologna", "cagliari", "como", "fiorentina", "frosinone", "genoa", "inter", "juventus", "lazio", "lecce", "milan", "monza", "napoli", "parma",
  "roma", "sassuolo", "torino", "udinese", "venezia"];

describe("a club's id from its name", () => {
  it("turns every name of the homepage's Serie A feed into the site's id for that club", () => {
    expect(FEED.map(teamId).sort()).toEqual(API);
  });

  it("agrees across sources: SportScore's names, the API's names and football-data's names", () => {
    expect(["AC Milan", "Milan", "A.C. Milan"].map(teamId)).toEqual(["milan", "milan", "milan"]);
    expect(["Inter Milan", "Internazionale Milano", "Inter"].map(teamId)).toEqual(["inter", "inter", "inter"]);
    expect(["Brighton & Hove Albion", "Brighton Hove Albion"].map(teamId)).toEqual(["brighton-hove-albion", "brighton-hove-albion"]);
    expect(teamId("Bayern München")).toBe("bayern-munich");
  });
});
