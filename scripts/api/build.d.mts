// validate takes data that may be broken: that is its job, so its input is loose.
export function validate(season: { matches: Array<Record<string, any>> }, teams: Record<string, string>): string[];
export function build(opts?: { input?: string; wikipedia?: string; espn?: string; out?: string; seasons?: string[]; now?: string; mutate?: (season: any) => void }): { files: number; competitions: number };
export function gameFiles(dir: string, matches: Array<Record<string, any>>, teams: Record<string, string>):
  { files: Map<string, Record<string, unknown>>; report: { games: number; unknown: string[]; disagree: string[] } } | null;
export function witness(merged: Array<Record<string, any>>, unmerged: Array<Record<string, any>>, dir: string): { matches: Array<Record<string, any>>; overruled: string[] };
