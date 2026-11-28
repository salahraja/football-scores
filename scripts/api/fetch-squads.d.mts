export type Squad = { team: { id: string; name: string }; players: Array<{ id: string; name: string; number: number | null; position: string | null }> };
export function reduceSquad(feed: unknown): Squad;
export function fetchSquads(opts?: { out?: string; season?: string; now?: Date; ids?: string[]; max?: number;
  fetchFn?: (url: string, init?: unknown) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>; wait?: () => Promise<void> }):
  Promise<{ saved: string[]; kept: string[]; later: number }>;
