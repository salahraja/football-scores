import { ref } from "vue";
import type { CompetitionCode } from "./types";

// The same six the backend serves (backend/football/competitions.py), in the same order.
export const COMPETITIONS: { code: CompetitionCode; name: string; short: string; matchdays: number }[] = [
  { code: "PL", name: "Premier League", short: "Premier League", matchdays: 38 },
  { code: "PD", name: "La Liga", short: "La Liga", matchdays: 38 },
  { code: "BL1", name: "Bundesliga", short: "Bundesliga", matchdays: 34 },
  { code: "SA", name: "Serie A", short: "Serie A", matchdays: 38 },
  { code: "FL1", name: "Ligue 1", short: "Ligue 1", matchdays: 34 },
  { code: "CL", name: "UEFA Champions League", short: "Champions League", matchdays: 8 },
];

// Plain-word names for the `stage` values the API sends. Stages that are numbered matchdays
// (the league table kind) are listed in LEAGUE_STAGES and shown as "League phase, matchday N".
export const STAGE_LABELS: Record<string, string> = {
  PRELIMINARY_ROUND: "Preliminary round",
  QUALIFICATION: "Qualifying",
  QUALIFICATION_ROUND_1: "Qualifying round 1",
  QUALIFICATION_ROUND_2: "Qualifying round 2",
  QUALIFICATION_ROUND_3: "Qualifying round 3",
  PLAYOFF_ROUND_1: "Play-off round 1",
  PLAYOFF_ROUND_2: "Play-off round 2",
  GROUP_STAGE: "Group stage",
  LEAGUE_STAGE: "League phase",
  APERTURA: "Apertura",
  CLAUSURA: "Clausura",
  CHAMPIONSHIP: "Championship round",
  RELEGATION: "Relegation round",
  RELEGATION_ROUND: "Relegation round",
  ROUND_1: "Round 1",
  ROUND_2: "Round 2",
  ROUND_3: "Round 3",
  ROUND_4: "Round 4",
  PLAYOFFS: "Knockout play-offs",
  LAST_64: "Round of 64",
  LAST_32: "Round of 32",
  LAST_16: "Round of 16",
  QUARTER_FINALS: "Quarter-finals",
  SEMI_FINALS: "Semi-finals",
  THIRD_PLACE: "Third-place match",
  FINAL: "Final",
};
export const LEAGUE_STAGES = ["REGULAR_SEASON", "GROUP_STAGE", "LEAGUE_STAGE"];

export const DEFAULT_COMPETITION: CompetitionCode = "SA";
const KEY = "football.competition";

function stored(): CompetitionCode {
  try {
    const value = localStorage.getItem(KEY);
    if (COMPETITIONS.some((c) => c.code === value)) return value as CompetitionCode;
  } catch {
    // storage blocked: fall through to the default
  }
  return DEFAULT_COMPETITION;
}

/** The league being looked at, shared by Fixtures and Table and remembered between visits. */
export const selectedCompetition = ref<CompetitionCode>(stored());

export function selectCompetition(code: CompetitionCode) {
  selectedCompetition.value = code;
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // not remembered; still works for this visit
  }
}

export function competitionName(code: string): string {
  return COMPETITIONS.find((c) => c.code === code)?.name ?? code;
}
