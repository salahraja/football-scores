# Football scores

Live scores, fixtures and results, league tables and club pages for the Premier League, La Liga, Bundesliga,
Serie A (the default), Ligue 1 and the Champions League.

- `backend/`: FastAPI. A cached, rate-limited proxy for the football-data.org v4 API. It is the only thing that
  holds the API key.
- `frontend/`: Vue 3 + Vite + TypeScript, plain CSS, vue-router. Views: Today, Fixtures & results, Table, and a
  club page at `/club/:id`. Juventus is pinned in the nav (found by name in the Serie A table).

Data comes from [football-data.org](https://www.football-data.org/) on the free tier (about 10 calls a minute), so
scores can lag a minute or two. The footer carries the attribution football-data.org asks for.

## Run it locally

You need a free football-data.org API key, Python 3.12+ with [uv](https://docs.astral.sh/uv/), and Node 22+.

```bash
# 1. backend, on http://127.0.0.1:8000
cd backend
FOOTBALL_DATA_KEY=your-key uv run uvicorn football.app:app

# 2. frontend, on http://localhost:5173 (Vite forwards /api to the backend)
cd frontend
npm install
npm run dev
```

Without `DATABASE_URL` the backend caches in memory; set it to a Postgres URL to share the cache across restarts.
`API_URL` points the dev proxy at another backend.

## Tests

```bash
cd backend && uv run pytest        # API, cache, rate limit, static serving
cd frontend && npm test            # vitest component tests
cd frontend && npx playwright test # smoke test at 320-1440 px against a fake API (see below)
```

The Playwright run starts a fake API (`frontend/e2e/fake-api.ts`) and Vite itself. If Playwright's browser is not
installed, run `npx playwright install chromium`, or set `PW_CHROMIUM` to an installed Chromium's path.
`SHOTS_DIR=some/dir npx playwright test screenshots` saves a picture of every view at phone and desktop size.

## Deploy on Render

`render.yaml` defines one web service: the build installs and builds the frontend, then installs the backend; the
start command runs uvicorn. FastAPI serves `frontend/dist` (any non-API path falls back to `index.html`, so deep links
like `/club/109` work). Set `FOOTBALL_DATA_KEY` (and `DATABASE_URL` if you want a shared cache) in the Render
dashboard. `FRONTEND_DIST` overrides where the built files are looked for. If the folder has no `index.html`, only the
API is served.

## Licence

See `LICENSE`.
