// validate takes data that may be broken: that is its job, so its input is loose.
export function validate(season: { matches: Array<Record<string, any>> }, teams: Record<string, string>): string[];
export function build(opts?: { input?: string; wikipedia?: string; out?: string; seasons?: string[]; now?: string; mutate?: (season: any) => void }): { files: number; competitions: number };
export function leadersFile(stats: { revid: number; text: string } | null, teams: Record<string, string>): {
  source: { name: string; url: string; licence: string };
  goals: { asOf: string | null; rows: Array<{ rank: number; player: string; club: string; team: string | null; value: number }> } | null;
  cleanSheets: { asOf: string | null; rows: Array<{ rank: number; player: string; club: string; team: string | null; value: number }> } | null;
} | null;
