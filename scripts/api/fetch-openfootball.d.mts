export function fetchSeasons(opts: { out: string; seasons: string[]; codes?: string[]; fetchFn?: (url: string, init?: any) => Promise<any> }): Promise<{ saved: string[]; kept: string[] }>;
