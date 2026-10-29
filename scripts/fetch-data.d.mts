export const BASE_URL: string;
export const COMPETITION: string;
export class FetchError extends Error {}
export function toStandingsRaw(body: unknown): any[];
export function toResultsRaw(body: unknown): any[];
export function run(opts?: {
  token?: string;
  dir?: string;
  fetchFn?: (url: string, init?: any) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}): Promise<boolean>;
