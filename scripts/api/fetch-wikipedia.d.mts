export function grids(text: string): string;
export function fetchPages(opts: { out: string; seasons: string[]; ids?: string[]; fetchFn?: (url: string, init?: any) => Promise<any> }): Promise<{ saved: string[]; kept: string[] }>;
