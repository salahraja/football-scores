// Contract-shaped sample data, used by the unit tests and by the fake API the browser tests run against.
import type { Match, MatchesResponse, RecentMatch, TeamRef, StandingsResponse, TeamResponse, TodayResponse } from "../src/types.ts";

function crest(letter: string, colour: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="${colour}"/><text x="20" y="26" font-size="18" text-anchor="middle" fill="#fff" font-family="sans-serif">${letter}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

export const teams = {
  juve: { id: 109, name: "Juventus FC", shortName: "Juventus", crest: crest("J", "#222") },
  inter: { id: 108, name: "FC Internazionale Milano", shortName: "Inter", crest: crest("I", "#0a3a8a") },
  milan: { id: 98, name: "AC Milan", shortName: "Milan", crest: crest("M", "#a01010") },
  napoli: { id: 113, name: "SSC Napoli", shortName: "Napoli", crest: crest("N", "#1a6fb0") },
  roma: { id: 100, name: "AS Roma", shortName: "Roma", crest: crest("R", "#8a2a10") },
  fiorentina: { id: 99, name: "ACF Fiorentina", shortName: "Fiorentina", crest: crest("F", "#5b2a86") },
  // The long-name case: the full club name, no crest (so the fallback letter shows), wide for a phone card.
  longName: { id: 450, name: "Hellas Verona Football Club", shortName: "Hellas Verona", crest: null },
  genoa: { id: 107, name: "Genoa CFC", shortName: "Genoa", crest: crest("G", "#9a1b2e") },
  leverkusen: { id: 3, name: "Bayer 04 Leverkusen", shortName: "Leverkusen", crest: crest("L", "#c01010") },
  atletico: { id: 78, name: "Club Atlético de Madrid", shortName: "Atleti", crest: crest("A", "#b02030") },
  barca: { id: 81, name: "FC Barcelona", shortName: "Barça", crest: crest("B", "#1b3a8a") },
  bayern: { id: 5, name: "FC Bayern München", shortName: "Bayern", crest: crest("B", "#c00020") },
};

const SA = { code: "SA" as const, name: "Serie A", emblem: "https://crests.football-data.org/SA.png" };
const CL = { code: "CL" as const, name: "UEFA Champions League", emblem: "https://crests.football-data.org/CL.png" };
const reg = { duration: "REGULAR" as const };

export const meta = { stale: false, partial: false, fetchedAt: "2026-10-16T12:00:00Z", age: 20 };

export const live: Match = {
  id: 1, competition: SA, utcDate: "2026-10-16T11:00:00Z", status: "IN_PLAY",
  homeTeam: teams.juve, awayTeam: teams.inter, score: { home: 1, away: 0, ...reg }, minute: 90, injuryTime: 3,
};
export const finished: Match = {
  id: 2, competition: SA, utcDate: "2026-10-16T08:00:00Z", status: "FINISHED",
  homeTeam: teams.milan, awayTeam: teams.napoli, score: { home: 2, away: 2, ...reg },
};
export const upcoming: Match = {
  id: 3, competition: SA, utcDate: "2026-10-16T18:45:00Z", status: "TIMED",
  homeTeam: teams.roma, awayTeam: teams.fiorentina, score: { home: null, away: null, ...reg },
};
export const longMatch: Match = {
  id: 6, competition: SA, utcDate: "2026-10-16T16:30:00Z", status: "TIMED",
  homeTeam: teams.longName, awayTeam: teams.genoa, score: { home: null, away: null, ...reg },
};
export const juveNext: Match = {
  id: 30, competition: SA, utcDate: "2026-10-24T18:45:00Z", status: "TIMED",
  homeTeam: teams.juve, awayTeam: teams.fiorentina, score: { home: null, away: null, ...reg },
};
export const aet: Match = {
  id: 4, competition: CL, utcDate: "2026-10-16T07:00:00Z", status: "FINISHED",
  homeTeam: teams.leverkusen, awayTeam: teams.atletico, score: { home: 2, away: 1, duration: "EXTRA_TIME" },
};
export const pens: Match = {
  id: 5, competition: CL, utcDate: "2026-10-16T06:00:00Z", status: "FINISHED",
  homeTeam: teams.barca, awayTeam: teams.bayern,
  score: { home: 1, away: 1, duration: "PENALTY_SHOOTOUT", penalties: { home: 6, away: 5 } },
};

export const today: TodayResponse = { matches: [upcoming, longMatch, finished, live, pens, aet], ...meta };

export const matchesSA: MatchesResponse = {
  matchday: 8, currentMatchday: 8, stage: null, stages: [], matches: [live, finished, upcoming, longMatch], ...meta,
};

const row = (position: number, team: TeamRef,pts: number, form: string) => ({
  position, team, played: 7, won: 4, draw: 2, lost: 1, goalsFor: 11, goalsAgainst: 5, goalDifference: 6, points: pts, form,
});

export const standingsSA: StandingsResponse = {
  season: { label: "2026-27", startDate: "2026-08-23", endDate: "2027-05-30", currentMatchday: 8 },
  table: [
    row(1, teams.inter, 17, "W,W,D,W,W"),
    row(2, teams.juve, 15, "W,D,W,L,W"),
    row(3, teams.napoli, 14, "D,W,W,W,D"),
    row(4, teams.milan, 13, "L,W,D,W,W"),
    row(5, teams.roma, 12, "W,L,L,D,W"),
    row(6, teams.fiorentina, 10, "L,L,D,W,L"),
    row(7, teams.longName, 9, "L,L,D,L,L"),
  ],
  zones: {
    championsLeague: { label: "Champions League", from: 1, to: 4 },
    europaLeague: { label: "Europa League", from: 5, to: 5 },
    conferenceLeague: { label: "Conference League", from: 6, to: 6 },
    relegation: { label: "Relegation", from: 18, to: 20 },
  },
  ...meta,
};

export const matchesCL: MatchesResponse = {
  matchday: 8, currentMatchday: 8, stage: null,
  stages: ["LEAGUE_STAGE", "PLAYOFFS", "LAST_16", "QUARTER_FINALS", "FINAL"],
  matches: [aet, pens], ...meta,
};

const juveGame = (
  id: number, comp: typeof SA | typeof CL, utcDate: string, home: TeamRef, away: TeamRef,
  h: number, a: number, result: "W" | "D" | "L",
): RecentMatch => ({
  id, competition: comp, utcDate, status: "FINISHED", homeTeam: home, awayTeam: away,
  score: { home: h, away: a, ...reg }, result,
});

// Newest first, five different dates about a week apart.
const juveRecent: RecentMatch[] = [
  juveGame(41, SA, "2026-10-04T18:45:00Z", teams.juve, teams.longName, 2, 0, "W"),
  juveGame(42, CL, "2026-09-29T19:00:00Z", teams.leverkusen, teams.juve, 1, 1, "D"),
  juveGame(43, SA, "2026-09-20T18:45:00Z", teams.juve, teams.roma, 3, 1, "W"),
  juveGame(44, SA, "2026-09-13T16:00:00Z", teams.napoli, teams.juve, 2, 1, "L"),
  juveGame(45, SA, "2026-09-06T18:45:00Z", teams.juve, teams.milan, 1, 0, "W"),
];

export const teamJuve: TeamResponse = {
  team: { ...teams.juve, venue: "Allianz Stadium", founded: 1897 },
  nextMatch: juveNext,
  recentMatches: juveRecent,
  positions: [{ competition: "SA", position: 2, points: 15 }, { competition: "CL", position: 5, points: 9 }],
  ...meta,
};

/** The same club after a cup-style tie settled on penalties, for the "won on pens" cases. */
export const teamJuveShootout: TeamResponse = {
  ...teamJuve,
  recentMatches: [
    {
      ...juveGame(46, CL, "2026-10-07T19:00:00Z", teams.juve, teams.bayern, 1, 1, "D"),
      score: { home: 1, away: 1, duration: "PENALTY_SHOOTOUT", penalties: { home: 6, away: 5 } },
      shootout: "W",
    },
    ...juveRecent.slice(1),
  ],
};

export const competitions = [
  { code: "PL", name: "Premier League", country: "England" },
  { code: "PD", name: "La Liga", country: "Spain" },
  { code: "BL1", name: "Bundesliga", country: "Germany" },
  { code: "SA", name: "Serie A", country: "Italy" },
  { code: "FL1", name: "Ligue 1", country: "France" },
  { code: "CL", name: "UEFA Champions League", country: "Europe" },
];

/** The fake API: path (with query) to [status, body]. */
export function route(url: string): [number, unknown] {
  const path = url.split("?")[0];
  if (path === "/api/competitions") return [200, competitions];
  if (path === "/api/today") return [200, today];
  if (path === "/api/competitions/CL/matches") {
    const stage = new URLSearchParams(url.split("?")[1] || "").get("stage");
    return [200, stage ? { ...matchesCL, stage, matchday: null } : matchesCL];
  }
  if (/^\/api\/competitions\/[A-Z0-9]+\/matches$/.test(path)) return [200, matchesSA];
  if (/^\/api\/competitions\/[A-Z0-9]+\/standings$/.test(path)) return [200, standingsSA];
  if (/^\/api\/teams\/\d+$/.test(path)) return [200, teamJuve];
  return [404, { error: "Not found" }];
}
