import type {
  Competition,
  CompetitionCode,
  MatchesResponse,
  StandingsResponse,
  TeamResponse,
  TodayResponse,
} from "./types";

/** A failed request. status 0 means the server could not be reached at all. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { headers: { Accept: "application/json" } });
  } catch {
    throw new ApiError(0, "network");
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // not JSON; handled below
  }
  if (!res.ok || body === null || typeof body !== "object") {
    const message = body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : "";
    throw new ApiError(res.ok ? 502 : res.status, message);
  }
  return body as T;
}

export const api = {
  competitions: () => getJson<Competition[]>("/api/competitions"),
  today: () => getJson<TodayResponse>("/api/today"),
  matches: (code: CompetitionCode, matchday?: number | null) =>
    getJson<MatchesResponse>(`/api/competitions/${code}/matches${matchday ? `?matchday=${matchday}` : ""}`),
  standings: (code: CompetitionCode) => getJson<StandingsResponse>(`/api/competitions/${code}/standings`),
  team: (id: number | string) => getJson<TeamResponse>(`/api/teams/${id}`),
};

/** What to tell a person about a failed request. */
export function errorMessage(err: unknown): string {
  const status = err instanceof ApiError ? err.status : 0;
  if (status === 503) return "The data service is busy, trying again shortly.";
  if (status === 429) return "Too many requests just now, trying again shortly.";
  if (status === 404) return "We could not find that.";
  if (status === 0) return "Cannot reach the server. Check your connection, trying again shortly.";
  return "Something went wrong loading this, trying again shortly.";
}
