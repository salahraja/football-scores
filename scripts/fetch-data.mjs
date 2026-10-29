// Build-time fetch: Serie A from football-data.org (v4) into data/raw/standings.json and data/raw/results.json,
// in the shape the engines read (src/data/types.ts). Node only, no dependencies.
//   FOOTBALL_DATA_TOKEN=... node scripts/fetch-data.mjs     (DATA_RAW=dir to write elsewhere)
// It never fails the build: with no token, or on any API problem, it prints a warning and leaves the committed
// snapshot as it is. Nothing is written unless BOTH calls succeed and the converted data looks sane.
// The token is only sent as the X-Auth-Token header. It is never printed or written, and the engines that run
// after this (scripts/data.sh) get an empty environment.
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const BASE_URL = "https://api.football-data.org/v4";
export const COMPETITION = "SA";
// The free tier allows 10 calls a minute. We make 2 (a retry after a 429 is the 3rd at most).
const MAX_RETRY_WAIT_S = 65;

export class FetchError extends Error {}

/** GET path with the token. Returns parsed JSON; throws FetchError with a message that is safe to print. */
export async function getJson(path, token, { fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetchFn(BASE_URL + path, { headers: { "X-Auth-Token": token }, signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      throw new FetchError(`${path}: could not reach football-data.org (${e?.name ?? "error"})`);
    }
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after")) || 60;
      if (attempt === 0 && wait <= MAX_RETRY_WAIT_S) {
        console.warn(`fetch-data: rate limited on ${path}, waiting ${wait}s before one retry`);
        await sleep(wait * 1000);
        continue;
      }
      throw new FetchError(`${path}: rate limited (429)`);
    }
    if (res.status !== 200) throw new FetchError(`${path}: HTTP ${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new FetchError(`${path}: unreadable reply`);
    }
  }
}

const int = (v) => Number.isInteger(v) && v >= 0;
const name = (t) => (typeof t?.shortName === "string" && t.shortName) || t?.name;

/** /competitions/SA/standings body -> data/raw/standings.json rows. position and points are left 0: the engines compute them. */
export function toStandingsRaw(body) {
  const total = (body?.standings ?? []).find((s) => s?.type === "TOTAL");
  const table = total?.table;
  if (!Array.isArray(table) || table.length === 0) throw new FetchError("standings: no TOTAL table in the reply");
  return table.map((r) => {
    const t = r?.team;
    if (!int(t?.id) || typeof name(t) !== "string" || ![r.playedGames, r.won, r.draw, r.lost].every(int))
      throw new FetchError("standings: a row has an unexpected shape");
    return {
      id: t.id,
      position: 0,
      team: { id: t.id, name: name(t) },
      matches: r.playedGames,
      wins: r.won,
      draws: r.draw,
      losses: r.lost,
      points: 0,
    };
  });
}

/** /competitions/SA/matches body -> data/raw/results.json events. Only finished matches with a full-time score. */
export function toResultsRaw(body) {
  if (!Array.isArray(body?.matches)) throw new FetchError("matches: no matches list in the reply");
  const out = [];
  for (const m of body.matches) {
    if (m?.status !== "FINISHED") continue;
    const h = m?.score?.fullTime?.home;
    const a = m?.score?.fullTime?.away;
    if (!int(m.id) || !int(h) || !int(a) || !int(m.matchday) || !int(m.homeTeam?.id) || !int(m.awayTeam?.id) ||
        typeof name(m.homeTeam) !== "string" || typeof name(m.awayTeam) !== "string")
      throw new FetchError("matches: a finished match has an unexpected shape");
    out.push({
      id: m.id,
      homeScore: { current: h },
      homeTeam: { id: m.homeTeam.id, name: name(m.homeTeam) },
      awayScore: { current: a },
      awayTeam: { id: m.awayTeam.id, name: name(m.awayTeam) },
      status: { type: "finished" },
      roundInfo: { round: m.matchday },
    });
  }
  if (out.length === 0) throw new FetchError("matches: no finished matches yet");
  return out;
}

/** Fetches both files. Returns { standings, results } (raw rows) or throws FetchError. */
export async function fetchRaw(token, opts) {
  const standings = toStandingsRaw(await getJson(`/competitions/${COMPETITION}/standings`, token, opts));
  const results = toResultsRaw(await getJson(`/competitions/${COMPETITION}/matches`, token, opts));
  return { standings, results };
}

/** Writes both files only after both fetches worked. Returns true if it wrote them. */
export async function run({ token, dir, fetchFn, sleep } = {}) {
  if (!token) {
    console.warn("fetch-data: warning: FOOTBALL_DATA_TOKEN is not set, keeping the committed snapshot in " + dir);
    return false;
  }
  let data;
  try {
    data = await fetchRaw(token, { fetchFn, sleep });
  } catch (e) {
    const msg = e instanceof FetchError ? e.message : "unexpected error";
    console.warn(`fetch-data: warning: ${msg}; keeping the committed snapshot in ${dir}`);
    return false;
  }
  mkdirSync(dir, { recursive: true });
  for (const [file, rows] of [["standings.json", data.standings], ["results.json", data.results]]) {
    const tmp = join(dir, file + ".tmp");
    writeFileSync(tmp, JSON.stringify(rows, null, 1) + "\n");
    renameSync(tmp, join(dir, file));
  }
  console.log(`fetch-data: wrote ${data.standings.length} table rows and ${data.results.length} finished matches to ${dir}`);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.env.DATA_RAW ?? join(dirname(fileURLToPath(import.meta.url)), "..", "data", "raw");
  await run({ token: process.env.FOOTBALL_DATA_TOKEN, dir });
}
