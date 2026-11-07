export const BASE: Record<string, string[]>;
export function inlineScripts(html: string): string[];
export function hashOf(script: string): string;
export function policy(hashes: string[]): string;
export function writeHeaders(dist: string): number;
