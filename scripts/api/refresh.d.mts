export interface RefreshState { files: Record<string, string>; changedAt: string; day: string; buildsToday: number }
export interface Decision { rebuild: boolean; why: string; changed: string[]; next: RefreshState | null }
export const LIMITS: { maxPerDay: number; minGapMinutes: number };
export function digests(dir: string): Record<string, string>;
export function decide(previous: RefreshState | null, files: Record<string, string>, now?: Date, options?: { force?: boolean; sourcesOk?: boolean; maxPerDay?: number; minGapMinutes?: number }): Decision;
export function sourcesFailed(log: string): boolean;
export function named(changed: string[], names: Record<string, string>): string;
