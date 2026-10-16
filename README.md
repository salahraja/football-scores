This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/api-routes/introduction) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.ts`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/api-routes/introduction) instead of React pages.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Backend (`backend/`)

A small FastAPI service that sits in front of the [football-data.org](https://www.football-data.org/documentation/quickstart) v4 API (free tier). It holds the API key, caches every response, and keeps under the free tier's 10 calls a minute. Python 3.12+, Postgres for the cache, managed with [uv](https://docs.astral.sh/uv/).

Run it locally:

```bash
cd backend
FOOTBALL_DATA_KEY=... uv run uvicorn football.app:app --reload
uv run pytest            # no network, no key needed
```

Environment variables (names only; never commit values):

| Name | Purpose |
| --- | --- |
| `FOOTBALL_DATA_KEY` | football-data.org token, sent only as the `X-Auth-Token` header. Without it, data endpoints answer 503. |
| `DATABASE_URL` | Postgres URL for the shared cache. Unset: in-memory cache (fine locally and in tests). The `api_cache` table is created at startup. |
| `CORS_ORIGINS` | Comma-separated origins allowed to call the API. Default `http://localhost:5173`. |

Set `TEST_DATABASE_URL` to a throwaway database to also run the Postgres cache tests.

### API

Competition codes: `PL`, `PD`, `BL1`, `SA` (the default), `FL1`, `CL`. Errors are `{"error": "..."}`: 404 unknown competition or team (or the provider has no such thing), 422 bad parameter, 429 call budget spent and nothing cached (or more than 30 `/api/teams` requests a minute from one address), 502 football-data.org failed or sent something unexpected, 503 no key configured, the provider is busy, or the only cached copy is over 24 hours old.

| Endpoint | Returns |
| --- | --- |
| `GET /healthz` | `{ok: true}` |
| `GET /api/competitions` | `[{code, name, country, emblem}]` (a constant table, no upstream call) |
| `GET /api/today` | `{matches: [match], stale, fetchedAt, age}` for the six competitions, today (UTC) |
| `GET /api/competitions/{code}/matches?matchday=N` | `{matchday, currentMatchday, matches: [match], stale, fetchedAt, age}`; no `matchday` means the current one, or when the API has none, the latest one played |
| `GET /api/competitions/{code}/standings` | `{season: {label, startDate, endDate, currentMatchday}, table: [row], zones, stale, fetchedAt, age}` |
| `GET /api/teams/{id}` | `{team: {id, name, shortName, crest, venue, founded}, nextMatch, recentMatches, positions: [{competition, position, points}], stale, fetchedAt, age}` |

Every object response ends with `stale` (bool), `fetchedAt` (UTC ISO time of the oldest data in it) and `age` (seconds since then). A stale response also has the header `X-Stale: true`, which the CORS config exposes to browsers.

`match` is `{id, competition: {code, name, emblem}, utcDate, status, minute?, injuryTime?, homeTeam, awayTeam, score}`, where a team is `{id, name, shortName, crest}`. `minute` and `injuryTime` are integers and appear only while a match is `IN_PLAY`, `PAUSED`, `EXTRA_TIME`, `PENALTY_SHOOTOUT` or `SUSPENDED`.

`score` is `{home, away, duration, penalties?}`. `home`/`away` are the result after 90 minutes plus extra time, never the provider's `fullTime`, which adds the shootout goals. `duration` is `REGULAR`, `EXTRA_TIME` or `PENALTY_SHOOTOUT`; the shootout is `penalties: {home, away}`, present only for `PENALTY_SHOOTOUT`. So a 1-1 game won 6-5 on penalties is `{home: 1, away: 1, duration: "PENALTY_SHOOTOUT", penalties: {home: 6, away: 5}}`.

In `recentMatches` (last 5, newest first) each match also has `result`: `W`, `D` or `L` for that team (a shootout counts as a draw). `nextMatch` is the team's next unfinished match, including one in play. A standings `row` is `{position, team, played, won, draw, lost, goalsFor, goalsAgainst, goalDifference, points, form}`.

The team page checks the id against a 24-hour index built from the six competitions' team lists (six upstream calls when cold, none after), so an unknown id is a 404 without spending the call budget. Once the index is warm a team page makes at most two upstream calls (its fixtures and one league table); positions in tables that are not cached are left out and the page is marked `stale`.

`zones` maps a zone id to `{label, from, to}` (inclusive table positions), for example `"relegation": {"label": "Relegation", "from": 18, "to": 20}`. It comes from a constant table in `backend/football/competitions.py`, not from the API. The 2026-27 Champions League places follow the UEFA access list (England and Spain have a fifth place through the European Performance Spots; see the sources in that file). Those spots go to different countries each year, so the table needs a check every summer.

### Cache and rate limit

Every upstream call goes through `football.client.FootballClient`.

- TTLs: today/live 60 s, matches 5 min (also competition details and a team's fixtures), standings 10 min, team index 24 h.
- Concurrent requests for the same cold key share one upstream call.
- At most 9 upstream calls in any 60 seconds across the process (a sliding window on a monotonic clock, so the limit holds for every minute, not just on average).
- When the budget is spent or football-data.org fails (not for a 404), an expired cached copy up to 24 hours old is served instead and marked stale. With nothing usable cached the answer is 429 (budget), 502 (failure) or 503 (copy too old).
- A reply of an unexpected shape is a 502 and is not cached.
- Postgres is used through one small connection pool (2 s connect timeout). After any database failure the cache runs from memory for 60 seconds before retrying.
- The key is never logged or returned; error messages are fixed text.

Deploy: `render.yaml` defines the API as a free Render web service rooted at `backend/`.
