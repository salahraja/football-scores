// The eight leagues, from the site's own football API (public/api/v1, docs/api.md), so the homepage can show any of them. Serie A's table and results keep coming from
// ./index.ts, the fresher football-data feed; here it only adds what that feed lacks: what each place leads to, and each club's id for its page.
const API = "/api/v1";

export interface Zone { kind: string; label: string; from: number; to: number }
export interface LeagueRow { position: number; name: string; id: string; played: number; won: number; drawn: number; lost: number; points: number }
export interface LeagueMatch { id: string; home: string; away: string; score: [number, number] }
export interface League { id: string; name: string; zones: Zone[]; note: string; table: LeagueRow[]; round: string; matches: LeagueMatch[] }
export interface Competition { id: string; name: string; current: string }

async function read<T>(path: string): Promise<T> {
  const reply = await fetch(`${API}/${path}`);
  if (!reply.ok) throw new Error(`${path}: ${reply.status}`);
  return (await reply.json()) as T;
}

export async function competitions(): Promise<Competition[]> {
  return (await read<{ competitions: Competition[] }>("competitions.json")).competitions;
}

export async function league(c: Competition): Promise<League> {
  const base = `${c.id}/${c.current}`;
  const [t, m, names] = await Promise.all([
    read<{ table: Omit<LeagueRow, "name" | "id">[] & { team: string }[]; zones?: { zones: Zone[]; note?: string } }>(`${base}/table.json`),
    read<{ matches: { id: string; round: string; stage: string; home: string; away: string; status: string; date: string; score: { ft: [number, number] } | null }[] }>(`${base}/matches.json`),
    read<{ teams: Record<string, string> }>(`${base}/teams.json`),
  ]);
  const name = (id: string) => names.teams[id] ?? id;
  const played = m.matches.filter((x) => x.status === "finished" && x.stage === "league" && x.score);
  const round = played.length ? played[played.length - 1].round : "";
  return {
    id: c.id, name: c.name, zones: t.zones?.zones ?? [], note: t.zones?.note ?? "",
    table: (t.table as unknown as (Omit<LeagueRow, "name" | "id"> & { team: string })[]).map((r) => ({ ...r, id: r.team, name: name(r.team) })),
    round,
    matches: played.filter((x) => x.round === round).map((x) => ({ id: x.id, home: name(x.home), away: name(x.away), score: x.score!.ft })),
  };
}

/** The zone a place in the table falls in, if any. */
export function zoneOf(zones: Zone[], position: number): Zone | undefined {
  return zones.find((z) => position >= z.from && position <= z.to);
}
