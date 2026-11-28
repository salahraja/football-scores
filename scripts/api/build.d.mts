// validate takes data that may be broken: that is its job, so its input is loose.
export function validate(season: { matches: Array<Record<string, any>> }, teams: Record<string, string>): string[];
export function build(opts?: { input?: string; wikipedia?: string; espn?: string; out?: string; seasons?: string[]; now?: string; mutate?: (season: any) => void }): { files: number; competitions: number };
export function leadersFile(stats: { revid: number; text: string } | null, teams: Record<string, string>): {
  source: { name: string; url: string; licence: string };
  goals: { asOf: string | null; rows: Array<{ rank: number; player: string; club: string; team: string | null; value: number }> } | null;
  cleanSheets: { asOf: string | null; rows: Array<{ rank: number; player: string; club: string; team: string | null; value: number }> } | null;
} | null;
export function gameFiles(dir: string, matches: Array<Record<string, any>>, teams: Record<string, string>, overruled?: string[], hidden?: Set<string>):
  { files: Map<string, Record<string, unknown>>; report: { games: number; unknown: string[]; disagree: string[] } } | null;
export function witness(merged: Array<Record<string, any>>, unmerged: Array<Record<string, any>>, dir: string): { matches: Array<Record<string, any>>; overruled: string[] };
export function playersFile(dir: string, teams: Record<string, string>): { source: { name: string; url: string }; players: Array<{ id: string; name: string; team: string; number: number | null; position: string | null }> } | null;
export function latestByPlayer(files: Map<string, any>, matches: Array<Record<string, any>>, teams: Record<string, string>): Record<string, { game: string; date: string; title: string; touches: number; shots: number; goals: number }>;
