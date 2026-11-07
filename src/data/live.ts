// Today's games from SportScore's free API, the same feed the league pages use (docs/api.md). Its terms ask for a visible link, and the homepage shows one.
// Primeira Liga is not covered, so it keeps its last round. A failed read is an empty list: the page falls back on what the build wrote.
const COMPETITION: Record<string, string> = {
  "it-1": "italian-serie-a", "en-1": "english-premier-league", "es-1": "spanish-la-liga", "de-1": "bundesliga",
  "fr-1": "french-ligue-1", "nl-1": "netherlands-eredivisie", "en-2": "english-football-league-championship",
};

export interface TodayGame { home: string; away: string; score: [number, number] | null; status: "live" | "finished" | "upcoming"; text: string; time: string }
interface Raw { home: string; away: string; home_score: string | number | null; away_score: string | number | null; status: string; status_text?: string; time: string }

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

export async function today(id: string, date = new Date().toISOString().slice(0, 10)): Promise<TodayGame[]> {
  if (!covered(id)) return [];
  try {
    const reply = await fetch(`https://sportscore.com/api/v1/fixtures/?sport=football&date=${date}&competition=${COMPETITION[id]}`);
    if (!reply.ok) return [];
    return ordered((((await reply.json()) as { matches?: Raw[] }).matches ?? []).map(game));
  } catch {
    return [];
  }
}
