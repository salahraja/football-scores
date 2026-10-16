"""FastAPI app. Run: FOOTBALL_DATA_KEY=... uv run uvicorn football.app:app"""
import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import shape
from .cache import Cache
from .client import (
    TTL_LIVE,
    TTL_MATCHES,
    TTL_STANDINGS,
    TTL_TEAMS,
    FootballClient,
    MissingKey,
    RateLimited,
    UpstreamError,
)
from .competitions import CODES, COMPETITIONS, DEFAULT_CODE

log = logging.getLogger("football.app")
# httpx logs every request line at INFO; nothing there is needed.
logging.getLogger("httpx").setLevel(logging.WARNING)


def create_app(client=None):
    app = FastAPI(title="Football scores API", docs_url=None, redoc_url=None)
    origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
    app.add_middleware(
        CORSMiddleware, allow_origins=[o.strip() for o in origins], allow_methods=["GET"]
    )
    if client is None:
        client = FootballClient(
            api_key=os.environ.get("FOOTBALL_DATA_KEY"),
            cache=Cache(os.environ.get("DATABASE_URL")),
        )
    app.state.client = client

    def error(status, message, headers=None):
        return JSONResponse({"error": message}, status_code=status, headers=headers)

    @app.exception_handler(MissingKey)
    async def _missing_key(request, exc):
        return error(503, "The server has no football-data.org key configured")

    @app.exception_handler(UpstreamError)
    async def _upstream(request, exc):
        return error(502, str(exc))

    @app.exception_handler(RateLimited)
    async def _limited(request, exc):
        return error(429, str(exc), {"Retry-After": "60"})

    @app.exception_handler(StarletteHTTPException)
    async def _http(request, exc):
        return error(exc.status_code, str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def _invalid(request, exc):
        return error(422, "Invalid request parameters")

    def fetch(response, path, ttl, params=None):
        """client.get, flagging stale data on the response (header X-Stale)."""
        body, stale = client.get(path, ttl, params)
        if stale:
            response.headers["X-Stale"] = "true"
        return body, stale

    def code_or_404(code):
        code = code.upper()
        if code not in CODES:
            raise HTTPException(404, "Unknown competition. Use one of: " + ", ".join(CODES))
        return code

    @app.get("/healthz")
    def healthz():
        return {"ok": True}

    @app.get("/api/competitions")
    def competitions():
        return COMPETITIONS

    @app.get("/api/today")
    def today(response: Response):
        # Array body per the contract, so staleness is only in the X-Stale header here.
        now = client.clock()
        day = datetime.fromtimestamp(now, timezone.utc).date()
        data, _ = fetch(
            response,
            "/matches",
            TTL_LIVE,
            {
                "competitions": ",".join(CODES),
                "dateFrom": day.isoformat(),
                "dateTo": (day + timedelta(days=1)).isoformat(),
            },
        )
        return [
            shape.match(m)
            for m in data.get("matches", [])
            if (m.get("utcDate") or "")[:10] == day.isoformat()
        ]

    @app.get("/api/competitions/{code}/matches")
    def competition_matches(
        code: str, response: Response, matchday: int | None = Query(None, ge=1, le=60)
    ):
        code = code_or_404(code)
        comp, stale = fetch(response, "/competitions/" + code, TTL_MATCHES)
        current = (comp.get("currentSeason") or {}).get("currentMatchday")
        wanted = matchday if matchday is not None else current
        data, stale2 = fetch(
            response, "/competitions/%s/matches" % code, TTL_MATCHES, {"matchday": wanted}
        )
        return {
            "matchday": wanted,
            "currentMatchday": current,
            "matches": [shape.match(m) for m in data.get("matches", [])],
            "stale": stale or stale2,
        }

    def standings_for(response, code):
        data, stale = fetch(response, "/competitions/%s/standings" % code, TTL_STANDINGS)
        return {**shape.standings(data, code), "stale": stale}

    @app.get("/api/competitions/{code}/standings")
    def competition_standings(code: str, response: Response):
        return standings_for(response, code_or_404(code))

    @app.get("/api/teams/{team_id}")
    def team(team_id: int, response: Response):
        info, stale = fetch(response, "/teams/%d" % team_id, TTL_TEAMS)
        data, stale2 = fetch(response, "/teams/%d/matches" % team_id, TTL_MATCHES)
        stale = stale or stale2

        matches = sorted(data.get("matches", []), key=lambda m: m.get("utcDate") or "")
        finished = [m for m in matches if shape.result_for(team_id, m)]
        upcoming = [m for m in matches if m.get("status") in ("SCHEDULED", "TIMED", "IN_PLAY", "PAUSED")]
        recent = [{**shape.match(m), "result": shape.result_for(team_id, m)} for m in finished[-5:]]

        positions = []
        for comp in info.get("runningCompetitions") or []:
            code = comp.get("code")
            if code not in CODES:
                continue
            try:
                table = standings_for(response, code)
            except (UpstreamError, RateLimited):
                continue  # a missing position should not fail the whole team page
            stale = stale or table["stale"]
            row = next((r for r in table["table"] if r["team"]["id"] == team_id), None)
            if row:
                positions.append(
                    {"competition": code, "position": row["position"], "points": row["points"]}
                )

        return {
            "team": {
                **shape.team_ref(info),
                "venue": info.get("venue"),
                "founded": info.get("founded"),
            },
            "nextMatch": shape.match(upcoming[0]) if upcoming else None,
            "recentMatches": list(reversed(recent)),  # newest first
            "positions": positions,
            "stale": stale,
        }

    return app


# Built lazily so importing the module (tests, tooling) does not open a database.
def __getattr__(name):
    if name == "app":
        global app
        app = create_app()
        return app
    raise AttributeError(name)
