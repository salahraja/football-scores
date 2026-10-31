// validate takes data that may be broken: that is its job, so its input is loose.
export function validate(season: { matches: Array<Record<string, any>> }, teams: Record<string, string>): string[];
export function build(opts?: { input?: string; out?: string; seasons?: string[]; now?: string; mutate?: (season: any) => void }): { files: number; competitions: number };
