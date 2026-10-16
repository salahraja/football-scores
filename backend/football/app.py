"""FastAPI app. Run: FOOTBALL_DATA_KEY=... uv run uvicorn football.app:app"""
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException, Path, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import shape
from .cache import Cache
from .client import (
    TTL_INDEX,
    TTL_LIVE,
    TTL_MATCHES,
    TTL_STANDINGS,
    CacheMiss,
    FootballClient,
    MissingKey,
    NotFound,
    RateLimited,
    Unavailable,
    UpstreamBusy,
    UpstreamError,
)
from .competitions import CODES, COMPETITIONS
from .ratelimit import PerKeyLimiter

log = logging.getLogger("football.app")
# httpx logs every request line at INFO; nothing there is needed.
logging.getLogger("httpx").setLevel(logging.WARNING)

TEAM_REQUESTS_PER_MINUTE = 30  # per client address
# Failures that leave one piece of a page missing without failing the page.
SOFT_FAILURES = (RateLimited, UpstreamError, UpstreamBusy, Unavailable)


def iso(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Meta:
    """What a response is made of: stale if any part is, as old as its oldest part."""

    def __init__(self, client):
        self.client = client
        self.stale = False
        self.oldest = None

    def add(self, fetched):
        self.stale = self.stale or fetched.stale
        if self.oldest is None or fetched.fetched_at < self.oldest:
            self.oldest = fetched.fetched_at
        return fetched.body

    def out(self, response):
        if self.stale:
            response.headers["X-Stale"] = "true"
        return {
            "stale": self.stale,
            "fetchedAt": iso(self.oldest),
            "age": max(0, int(self.client.clock() - self.oldest)),
        }


def create_app(client=None):
    @asynccontextmanager
    async def lifespan(app):
        yield
        client.cache.close()

    app = FastAPI(title="Football scores API", docs_url=None, redoc_url=None, lifespan=lifespan)
    origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in origins],
        allow_methods=["GET"],
        expose_headers=["X-Stale"],  # without this a browser cannot read it cross-origin
    )
    if client is None:
        client = FootballClient(
            api_key=os.environ.get("FOOTBALL_DATA_KEY"),
            cache=Cache(os.environ.get("DATABASE_URL")),
        )
    app.state.client = client
    team_limiter = PerKeyLimiter(TEAM_REQUESTS_PER_MINUTE, 60, client.monotonic)

    def error(status, message, headers=None):
        return JSONResponse({"error": message}, status_code=status, headers=headers)

    @app.exception_handler(MissingKey)
    async def _missing_key(request, exc):
        return error(503, "The server has no football-data.org key configured")

    @app.exception_handler(UpstreamError)
    async def _upstream(request, exc):
        return error(502, str(exc))

    @app.exception_handler(UpstreamBusy)
    async def _busy(request, exc):
        return error(503, str(exc))

    @app.exception_handler(Unavailable)
    async def _unavailable(request, exc):
        return error(503, str(exc))

    @app.exception_handler(NotFound)
    async def _not_found(request, exc):
        return error(404, "Not found")

    @app.exception_handler(RateLimited)
    async def _limited(request, exc):
        return error(429, str(exc), {"Retry-After": "60"})

    @app.exception_handler(StarletteHTTPException)
    async def _http(request, exc):
        return error(exc.status_code, str(exc.detail), getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def _invalid(request, exc):
        return error(422, "Invalid request parameters")

    @app.exception_handler(Exception)
    async def _unexpected(request, exc):
        log.error("unhandled %s on %s", type(exc).__name__, request.url.path)
        return error(500, "Something went wrong on the server")

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
        day = datetime.fromtimestamp(client.clock(), timezone.utc).date()
        meta = Meta(client)
        data = meta.add(
            client.get(
                "/matches",
                TTL_LIVE,
                {
                    "competitions": ",".join(CODES),
                    "dateFrom": day.isoformat(),
                    "dateTo": (day + timedelta(days=1)).isoformat(),
                },
                check=shape.ok_matches,
            )
        )
        return {
            "matches": [
                shape.match(m) for m in data["matches"] if (m.get("utcDate") or "")[:10] == day.isoformat()
            ],
            **meta.out(response),
        }

    def latest_matchday(matches):
        """The matchday in play or most recently played, else the first one."""
        started = [m.get("matchday") for m in matches
                   if m.get("status") in ("FINISHED",) + shape.LIVE_STATUSES and m.get("matchday")]
        if started:
            return max(started)
        every = [m.get("matchday") for m in matches if m.get("matchday")]
        return min(every) if every else None

    @app.get("/api/competitions/{code}/matches")
    def competition_matches(code: str, response: Response, matchday: int | None = Query(None, ge=1, le=60)):
        code = code_or_404(code)
        meta = Meta(client)
        comp = meta.add(client.get("/competitions/" + code, TTL_MATCHES, check=shape.ok_competition))
        current = (comp.get("currentSeason") or {}).get("currentMatchday")
        wanted = matchday if matchday is not None else current
        path = "/competitions/%s/matches" % code
        if wanted is not None:
            matches = meta.add(client.get(path, TTL_MATCHES, {"matchday": wanted}, check=shape.ok_matches))["matches"]
        else:
            # No current matchday (between seasons, or a cup): one fetch of the season, pick from it.
            season = meta.add(client.get(path, TTL_MATCHES, check=shape.ok_matches))["matches"]
            wanted = latest_matchday(season)
            matches = [m for m in season if m.get("matchday") == wanted]
        return {
            "matchday": wanted,
            "currentMatchday": current,
            "matches": [shape.match(m) for m in matches],
            **meta.out(response),
        }

    def standings_for(code, meta, **kw):
        data = meta.add(client.get("/competitions/%s/standings" % code, TTL_STANDINGS, check=shape.ok_standings, **kw))
        return shape.standings(data, code)

    @app.get("/api/competitions/{code}/standings")
    def competition_standings(code: str, response: Response):
        meta = Meta(client)
        body = standings_for(code_or_404(code), meta)
        return {**body, **meta.out(response)}

    def team_index(meta):
        """team id -> {team, codes}, from the six competitions' team lists (cached 24 h).

        Returns (index, first_error). first_error is set when a list could not be had, which
        means "not in the index" is not yet proof that a team does not exist.
        """
        index, first_error = {}, None
        for code in CODES:
            try:
                data = meta.add(client.get("/competitions/%s/teams" % code, TTL_INDEX, check=shape.ok_teams))
            except NotFound:
                continue
            except SOFT_FAILURES as exc:
                first_error = first_error or exc
                continue
            for t in data["teams"]:
                index.setdefault(t["id"], {"team": t, "codes": []})["codes"].append(code)
        return index, first_error

    def client_address(request):
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[-1].strip()  # the last hop is the one our proxy saw
        return request.client.host if request.client else "unknown"

    @app.get("/api/teams/{team_id}")
    def team(request: Request, response: Response, team_id: int = Path(ge=1)):
        if not team_limiter.try_acquire(client_address(request)):
            raise HTTPException(429, "Too many team requests; try again in a minute", {"Retry-After": "60"})
        meta = Meta(client)
        index, index_error = team_index(meta)
        found = index.get(team_id)
        if found is None:
            if index_error is not None:
                raise index_error
            raise HTTPException(404, "Unknown team")
        info = found["team"]

        data = meta.add(client.get("/teams/%d/matches" % team_id, TTL_MATCHES, check=shape.ok_matches))
        matches = sorted(data["matches"], key=lambda m: m.get("utcDate") or "")
        finished = [m for m in matches if shape.result_for(team_id, m)]
        upcoming = [m for m in matches if m.get("status") in shape.UPCOMING_STATUSES]
        recent = [{**shape.match(m), "result": shape.result_for(team_id, m)} for m in finished[-5:]]

        # Positions come from cached league tables; at most one table is fetched cold, so
        # the whole page costs no more than two upstream calls once the index is warm.
        positions, cold = [], 1
        for code in found["codes"]:
            try:
                table = standings_for(code, meta, cache_only=True)
            except CacheMiss:
                if cold <= 0:
                    meta.stale = True  # a position was left out
                    continue
                cold -= 1
                try:
                    table = standings_for(code, meta)
                except NotFound:
                    continue  # this competition has no table (a cup)
                except SOFT_FAILURES:
                    meta.stale = True
                    continue
            row = next((r for r in table["table"] if r["team"]["id"] == team_id), None)
            if row:
                positions.append({"competition": code, "position": row["position"], "points": row["points"]})

        return {
            "team": {**shape.team_ref(info), "venue": info.get("venue"), "founded": info.get("founded")},
            "nextMatch": shape.match(upcoming[0]) if upcoming else None,
            "recentMatches": list(reversed(recent)),  # newest first
            "positions": positions,
            **meta.out(response),
        }

    return app


# Built lazily so importing the module (tests, tooling) does not open a database.
def __getattr__(name):
    if name == "app":
        global app
        app = create_app()
        return app
    raise AttributeError(name)
