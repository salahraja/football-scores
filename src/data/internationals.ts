// International breaks (Salah, 2026-11-17: "It's international break, we should be able to recognize that and display the UEFA and
// AFCON matches"). The site's own today.json carries every league's and tournament's games from yesterday to three days ahead; when no
// club league plays from yesterday to tomorrow while a nations' tournament does, the homepage opens on the internationals. Their live
// scores come from SportScore like the leagues' (live.ts); these games from today.json fill in when SportScore has none (yesterday's
// results, a game it does not list). Hidden nations (tournaments.json `hide`) are already left out of today.json by the build.
import type { TodayGame } from "./live";

const API = "/api/v1";

export interface DayMatch {
  league: string; round: string; date: string; time: string; kickoff: string; home: string; away: string; status: string;
  score: { ft: [number, number] } | null; homeName: string; awayName: string;
}
export interface Cup { id: string; name: string; teams: string; season: string }
export interface GroupRow { position: number; team: string; name: string; played: number; won: number; drawn: number; lost: number; points: number }
export interface Group { name: string; table: GroupRow[] }

// The Nations League first: it is the one the homepage's clubs' players are away for (Salah follows Juventus); then the file's order.
const FIRST = ["nations-league"];

/** YYYY-MM-DD, `by` days from `date`. */
function shift(date: string, by: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

/** The nations' tournaments to show when it is a break, else none. */
export function breakCups(matches: DayMatch[], cups: Cup[], clubLeagues: string[], today: string): Cup[] {
  const from = shift(today, -1), to = shift(today, 1);
  const near = matches.filter((m) => m.date >= from && m.date <= to);
  if (near.some((m) => clubLeagues.includes(m.league))) return [];
  const playing = cups.filter((c) => c.teams === "nations" && near.some((m) => m.league === c.id));
  const rank = (c: Cup) => (FIRST.includes(c.id) ? FIRST.indexOf(c.id) : FIRST.length);
  return playing.sort((a, b) => rank(a) - rank(b));
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** A cup's games of today, or yesterday's results when today has none, as the poster shows them. */
export function cupGames(matches: DayMatch[], id: string, today: string): TodayGame[] {
  const mine = matches.filter((m) => m.league === id);
  const now = mine.filter((m) => m.date === today);
  const day = now.length ? now : mine.filter((m) => m.date === shift(today, -1));
  return day
    .slice()
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .map((m) => {
      const status: TodayGame["status"] = m.status === "finished" ? "finished" : m.status === "live" ? "live" : "upcoming";
      const when = status === "upcoming" ? `Today ${clock(m.kickoff)}` : m.date === today ? (status === "live" ? "Live" : "Full time") : "Yesterday";
      return { home: m.homeName, away: m.awayName, score: m.score ? m.score.ft : null, status, text: `${m.round} · ${when}`, time: m.kickoff };
    });
}

/** The local date, YYYY-MM-DD. */
export function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function read<T>(path: string): Promise<T> {
  const reply = await fetch(`${API}/${path}`);
  if (!reply.ok) throw new Error(`${path}: ${reply.status}`);
  return (await reply.json()) as T;
}

/** today.json's games and the tournaments; empty when either cannot be read (the homepage then stays on its leagues). */
export async function loadDay(): Promise<{ matches: DayMatch[]; cups: Cup[] }> {
  try {
    const [day, t] = await Promise.all([read<{ matches: DayMatch[] }>("today.json"), read<{ tournaments: Cup[] }>("tournaments.json")]);
    return { matches: day.matches ?? [], cups: t.tournaments ?? [] };
  } catch {
    return { matches: [], cups: [] };
  }
}

/** The group a team plays in, with names, from the tournament's groups.json and teams.json. */
export async function groupOf(cup: Cup, teamName: string): Promise<Group | null> {
  try {
    const [g, t] = await Promise.all([
      read<{ groups: { name: string; table: Omit<GroupRow, "name">[] }[] }>(`${cup.id}/${cup.season}/groups.json`),
      read<{ teams: Record<string, string> }>(`${cup.id}/${cup.season}/teams.json`),
    ]);
    const name = (id: string) => t.teams[id] ?? id;
    const found = g.groups.find((x) => x.table.some((r) => name(r.team) === teamName));
    return found ? { name: found.name, table: found.table.map((r) => ({ ...r, name: name(r.team) })) } : null;
  } catch {
    return null;
  }
}
