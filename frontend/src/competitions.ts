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
