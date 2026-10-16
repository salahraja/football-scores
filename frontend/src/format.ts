import type { Match, Result, Score } from "./types";

export const LIVE_STATUSES = ["IN_PLAY", "PAUSED", "EXTRA_TIME", "PENALTY_SHOOTOUT", "SUSPENDED"];

export type Phase = "live" | "finished" | "upcoming" | "off";

export function phase(status: string): Phase {
  if (LIVE_STATUSES.includes(status)) return "live";
  if (status === "FINISHED" || status === "AWARDED") return "finished";
  if (status === "POSTPONED" || status === "CANCELLED") return "off";
  return "upcoming";
}

/** "2-1", or a dash while there is no score. */
export function scoreText(score: Score): string {
  if (score.home === null || score.away === null) return "–";
  return `${score.home}–${score.away}`;
}

/** Small print under a score: "AET" after extra time, "pens 6-5" after a shootout (home-away). */
export function scoreNote(score: Score): string | null {
  if (score.duration === "PENALTY_SHOOTOUT" && score.penalties) {
    return `AET, pens ${score.penalties.home}-${score.penalties.away}`;
  }
  if (score.duration === "EXTRA_TIME" || score.duration === "PENALTY_SHOOTOUT") return "AET";
  return null;
}

/** "67'", "90+3'", "HT" and so on for a match under way. */
export function liveLabel(m: Pick<Match, "status" | "minute" | "injuryTime">): string {
  if (m.status === "PAUSED") return "HT";
  if (m.status === "PENALTY_SHOOTOUT") return "Pens";
  if (m.status === "SUSPENDED") return "Suspended";
  if (m.minute === undefined) return m.status === "EXTRA_TIME" ? "Extra time" : "Live";
  const added = m.injuryTime ? `+${m.injuryTime}` : "";
  return `${m.minute}${added}'`;
}

const STATUS_TEXT: Record<string, string> = {
  POSTPONED: "Postponed",
  CANCELLED: "Cancelled",
  AWARDED: "Awarded",
  SUSPENDED: "Suspended",
};

/** 24-hour kick-off time in the viewer's zone ("13:45"), the same in every locale. */
export function kickoffTime(utcDate: string, timeZone?: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(
    new Date(utcDate),
  );
}

/** Day first, in the viewer's zone ("Fri 16 Oct"). */
export function kickoffDay(utcDate: string, timeZone?: string, locale?: string): string {
  const parts = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone }).formatToParts(
    new Date(utcDate),
  );
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

/** The line that says where a match stands: minute, FT, kick-off time or why it is off. */
export function statusText(m: Match, timeZone?: string): string {
  const p = phase(m.status);
  if (p === "live") return liveLabel(m);
  if (p === "finished") return m.status === "AWARDED" ? STATUS_TEXT.AWARDED : "FT";
  if (p === "off") return STATUS_TEXT[m.status] ?? m.status;
  return kickoffTime(m.utcDate, timeZone);
}

/** "1 minute old", "12 minutes old", "2 hours old". */
export function ageText(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 120) return `${minutes} minute${minutes === 1 ? "" : "s"} old`;
  const hours = Math.round(minutes / 60);
  return `${hours} hours old`;
}

export interface FormItem {
  result: Result;
  shootout?: "W" | "L";
}

/** The table's form string ("W,D,L,W,W", oldest first or last as sent) as chips. */
export function parseForm(form: string | null | undefined): FormItem[] {
  if (!form) return [];
  return form
    .replace(/[^WDL]/g, "")
    .split("")
    .map((result) => ({ result: result as Result }));
}

export function chipTitle(item: FormItem): string {
  if (item.result === "D" && item.shootout) {
    return item.shootout === "W" ? "Draw, won on pens" : "Draw, lost on pens";
  }
  return { W: "Win", D: "Draw", L: "Loss" }[item.result];
}
