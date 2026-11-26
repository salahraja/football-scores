// Today's games from SportScore's free API, the same feed the league pages use (docs/api.md). Its terms ask for a visible link, and the homepage shows one.
// Primeira Liga is not covered, so it keeps its last round. A failed read is an empty list: the page falls back on what the build wrote.
const COMPETITION: Record<string, string> = {
  "it-1": "italian-serie-a", "en-1": "english-premier-league", "es-1": "spanish-la-liga", "de-1": "bundesliga",
  "fr-1": "french-ligue-1", "nl-1": "netherlands-eredivisie", "en-2": "english-football-league-championship",
  // the internationals the homepage opens on in a break (internationals.ts)
  "nations-league": "uefa-nations-league", afcon: "caf-africa-cup-of-nations",
};
// No game of a hidden nation or its clubs is ever shown (data/api/tournaments.json `hide`; Salah: Israel is left out of golboard).
const HIDDEN = /\bisrael/i;

export interface TodayGame { home: string; away: string; score: [number, number] | null; status: "live" | "finished" | "upcoming"; text: string; time: string }
interface Raw { home: string; away: string; home_score: string | number | null; away_score: string | number | null; status: string; status_text?: string; time: string; url?: string }

function kickoff(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function game(m: Raw): TodayGame {
  const status = m.status === "finished" ? "finished" : m.status === "upcoming" ? "upcoming" : "live";
  const scored = status !== "upcoming" && m.home_score != null && m.away_score != null && m.home_score !== "" && m.away_score !== "";
  const text = status === "finished" ? "Full time" : status === "upcoming" ? `Today ${kickoff(m.time)}` : `Live · ${m.status_text ?? ""}`.trim();
  return { home: m.home, away: m.away, score: scored ? [Number(m.home_score), Number(m.away_score)] : null, status, text, time: m.time };
}

// Live first, then what has just finished, then what is still to come, earliest first.
function ordered(games: TodayGame[]) {
  const rank = { live: 0, finished: 1, upcoming: 2 };
  return [...games].sort((a, b) => rank[a.status] - rank[b.status] || (a.status === "finished" ? b.time.localeCompare(a.time) : a.time.localeCompare(b.time)));
}

export function covered(id: string) {
  return id in COMPETITION;
}

// The match's slug in SportScore's detail call, from its page address (/football/match/<teams>/<id>/), as the league pages' live.js reads it.
function slugOf(url = "") {
  const p = url.split("/").filter(Boolean);
  return p.length >= 4 ? `${p[2]}-${p[3]}` : null;
}

// The minute of a live game, from SportScore's match detail (the league pages show it too); null when it cannot be read.
async function liveMinute(m: Raw): Promise<number | null> {
  const slug = slugOf(m.url);
  if (!slug) return null;
  try {
    const reply = await fetch(`https://sportscore.com/api/v1/match/?sport=football&slug=${encodeURIComponent(slug)}`);
    if (!reply.ok) return null;
    const minute = ((await reply.json()) as { match?: { live_minute?: number | string | null } }).match?.live_minute;
    return minute ? Number(minute) || null : null;
  } catch {
    return null;
  }
}

export async function today(id: string, date = new Date().toISOString().slice(0, 10)): Promise<TodayGame[]> {
  if (!covered(id)) return [];
  try {
    const reply = await fetch(`https://sportscore.com/api/v1/fixtures/?sport=football&date=${date}&competition=${COMPETITION[id]}`);
    if (!reply.ok) return [];
    const all = ((await reply.json()) as { matches?: Raw[] }).matches ?? [];
    const shown = all.filter((m) => !HIDDEN.test(m.home) && !HIDDEN.test(m.away));
    // live games say their minute ("Live · 67'"), one detail call each; the half ("Live · 2nd half") when the detail is not there
    const games = await Promise.all(shown.map(async (m) => {
      const g = game(m);
      if (g.status !== "live") return g;
      const minute = await liveMinute(m);
      return minute ? { ...g, text: `Live · ${minute}'` } : g;
    }));
    return ordered(games);
  } catch {
    return [];
  }
}
