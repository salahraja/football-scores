// Tables that move with the goals: while a league's games are live, its table shows where each club would stand if the live scores
// ended now. Points, then goal difference, then goals scored; clubs level on all three keep the official order. Leagues break ties
// their own ways (Serie A by head-to-head), so this is "as it stands", marked live, never the official table.
import type { TodayGame } from "./live";

export interface TableIn { id: string; name: string; position: number; played: number; won: number; drawn: number; lost: number; points: number; gf?: number; ga?: number; gd?: number }
export type TableOut<T extends TableIn> = T & { moved: number; live: boolean };

export function liveTable<T extends TableIn>(rows: T[], games: TodayGame[], idOf: (feedName: string) => string): TableOut<T>[] {
  const out = new Map<string, TableOut<T>>(rows.map((r) => [r.id, { ...r, moved: 0, live: false }]));
  const add = (id: string, scored: number, conceded: number) => {
    const r = out.get(id);
    if (!r) return;
    r.live = true;
    r.played += 1;
    if (scored > conceded) { r.won += 1; r.points += 3; }
    else if (scored === conceded) { r.drawn += 1; r.points += 1; }
    else r.lost += 1;
    if (r.gf !== undefined) r.gf += scored;
    if (r.ga !== undefined) r.ga += conceded;
    if (r.gd !== undefined) r.gd += scored - conceded;
  };
  for (const g of games) {
    if (g.status !== "live") continue;
    const home = idOf(g.home), away = idOf(g.away);
    if (!g.score) { // on now but no score yet: still marked live
      for (const id of [home, away]) { const r = out.get(id); if (r) r.live = true; }
      continue;
    }
    add(home, g.score[0], g.score[1]);
    add(away, g.score[1], g.score[0]);
  }
  const sorted = [...out.values()].sort((a, b) => b.points - a.points || (b.gd ?? 0) - (a.gd ?? 0) || (b.gf ?? 0) - (a.gf ?? 0) || a.position - b.position);
  return sorted.map((r, i) => ({ ...r, moved: r.position - (i + 1), position: i + 1 }));
}
