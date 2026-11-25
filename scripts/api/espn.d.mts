export type Side = "home" | "away";
export type MatchDetail = {
  espn: string; kickoff: string;
  home: { name: string; score: number; formation: string | null }; away: { name: string; score: number; formation: string | null };
  players: Array<{ id: string; name: string; side: Side; number: number | null; position: string | null; starter: boolean }>;
  events: Array<{ minute: string; kind: "goal" | "penalty" | "own-goal" | "yellow" | "red" | "sub"; side: Side; player: string | null; other: string | null }>;
  shots: Array<{ side: Side; player: string; minute: string; x: number; y: number; xg: number | null; outcome: "goal" | "saved" | "off" | "blocked" | "post"; body: string | null; penalty: boolean }>;
  positions: boolean;
  touches: Record<string, number[]>;
};
export const ZONES: { x: number[]; y: number[] };
export function zoneOf(x: number, y: number): number;
export function reduceMatch(summary: unknown, pages: unknown[]): MatchDetail;
