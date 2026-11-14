export function grids(text: string): string;
import type { Tournament } from "./types.d.mts";
export function fetchTournament(opts: { out: string; tournament: Tournament; fetchFn?: (url: string, init?: any) => Promise<any> }): Promise<{ saved: string[]; kept: string[] }>;
export function fetchPages(opts: { out: string; seasons: string[]; ids?: string[]; fetchFn?: (url: string, init?: any) => Promise<any> }): Promise<{ saved: string[]; kept: string[] }>;
