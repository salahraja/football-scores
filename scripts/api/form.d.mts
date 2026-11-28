export interface FormGame { date: string; opponent: string; home: boolean; for: number; against: number; result: "w" | "d" | "l"; match: unknown }
export function formOf(matches: unknown[], team: string, n?: number): FormGame[];
export function meetings(seasons: unknown[][], a: string, b: string, before: string): { date: string; home: string; away: string; score: { ft: [number, number] } }[];
