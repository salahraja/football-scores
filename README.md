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

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

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

Competition codes: `PL`, `PD`, `BL1`, `SA` (the default), `FL1`, `CL`. Errors are `{"error": "..."}`: 404 unknown competition, 422 bad parameter, 429 call budget spent and nothing cached, 502 football-data.org failed, 503 no key configured.

| Endpoint | Returns |
| --- | --- |
| `GET /healthz` | `{ok: true}` |
| `GET /api/competitions` | `[{code, name, country, emblem}]` (a constant table, no upstream call) |
| `GET /api/today` | `[match]` for the six competitions, today (UTC) |
| `GET /api/competitions/{code}/matches?matchday=N` | `{matchday, currentMatchday, matches: [match], stale}`; no `matchday` means the current one |
| `GET /api/competitions/{code}/standings` | `{season: {label, startDate, endDate, currentMatchday}, table: [row], zones, stale}` |
| `GET /api/teams/{id}` | `{team: {id, name, shortName, crest, venue, founded}, nextMatch, recentMatches, positions: [{competition, position, points}], stale}` |

`match` is `{id, competition: {code, name, emblem}, utcDate, status, minute?, homeTeam, awayTeam, score: {home, away}}`, where a team is `{id, name, shortName, crest}`. `minute` appears only while a match is `IN_PLAY` or `PAUSED`. In `recentMatches` (last 5, newest first) each match also has `result`: `W`, `D` or `L` for that team. A standings `row` is `{position, team, played, won, draw, lost, goalsFor, goalsAgainst, goalDifference, points, form}`.

`zones` maps a zone id to `{label, from, to}` (inclusive table positions), for example `"relegation": {"label": "Relegation", "from": 18, "to": 20}`. It comes from a constant table in `backend/football/competitions.py`, not from the API, and follows the usual European-place layout, so it can drift a little when UEFA rules change.

### Cache and rate limit

Every upstream call goes through `football.client.FootballClient`.

- TTLs: today/live 60 s, matches 5 min (also competition details and a team's fixtures), standings 10 min, team details 1 h.
- At most 9 upstream calls in any 60 seconds across the process (a sliding window, so the limit holds for every minute, not just on average).
- When the budget is spent, or football-data.org fails, an expired cached copy is served instead and marked stale: `stale: true` in the JSON, and an `X-Stale: true` header on every endpoint. `/api/today` returns a bare array, so its staleness is only in the header. With nothing cached the answer is 429 (budget) or 502 (upstream failure).
- The key is never logged or returned; error messages are fixed text.

Deploy: `render.yaml` defines the API as a free Render web service rooted at `backend/`.
