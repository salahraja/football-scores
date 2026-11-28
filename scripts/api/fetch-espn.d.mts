export function fetchMatches(opts?: { out?: string; season?: string; now?: Date; days?: number; ids?: string[]; max?: number; backfill?: number;
  fetchFn?: (url: string, init?: unknown) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>; wait?: () => Promise<void> }):
  Promise<{ saved: string[]; kept: string[]; later: number; backfilled: string[] }>;
