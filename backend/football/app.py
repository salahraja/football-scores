"""FastAPI app. Run: FOOTBALL_DATA_KEY=... uv run uvicorn football.app:app"""
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path as FsPath

from fastapi import FastAPI, HTTPException, Path, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
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
from .competitions import CODES, COMPETITIONS, STAGED, STAGES, TEAM_SEARCH_ORDER
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
        self.stale = False  # some of it is old data
        self.partial = False  # some of it was left out to save upstream calls
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
            "partial": self.partial,
            "fetchedAt": iso(self.oldest),
            "age": max(0, int(self.client.clock() - self.oldest)),
        }


DEFAULT_DIST = FsPath(__file__).resolve().parents[2] / "frontend" / "dist"


def create_app(client=None, dist=None):
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
    def competition_matches(
        code: str,
        response: Response,
        matchday: int | None = Query(None, ge=1, le=60),
        stage: str | None = Query(None),
    ):
        code = code_or_404(code)
        if stage is not None and stage not in STAGES:
            raise HTTPException(422, "Unknown stage. Use one of: " + ", ".join(STAGES))
        meta = Meta(client)
        comp = meta.add(client.get("/competitions/" + code, TTL_MATCHES, check=shape.ok_competition))
        current = (comp.get("currentSeason") or {}).get("currentMatchday")
        # A stage on its own means the whole round (knockout matches may have no matchday).
        wanted = matchday if matchday is not None or stage is not None else current
        path = "/competitions/%s/matches" % code
        if stage is not None:
            matches = meta.add(
                client.get(path, TTL_MATCHES, {"stage": stage, "matchday": matchday}, check=shape.ok_matches)
            )["matches"]
        elif wanted is not None:
            matches = meta.add(client.get(path, TTL_MATCHES, {"matchday": wanted}, check=shape.ok_matches))["matches"]
        else:
            # No current matchday (between seasons, or a cup): one fetch of the season, pick from it.
            season = meta.add(client.get(path, TTL_MATCHES, check=shape.ok_matches))["matches"]
            wanted = latest_matchday(season)
            matches = [m for m in season if m.get("matchday") == wanted]
        stages = []
        if code in STAGED:
            # Which rounds have matches: one cached read of the season, at low priority.
            try:
                season = meta.add(client.get(path, TTL_MATCHES, check=shape.ok_matches, low_priority=True))["matches"]
                have = {m.get("stage") for m in season}
                stages = [s for s in STAGES if s in have]
            except NotFound:
                pass  # no season to read: no stage list
            except SOFT_FAILURES:
                meta.partial = True
        return {
            "matchday": wanted,
            "currentMatchday": current,
            "stage": stage,
            "stages": stages,
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

    def find_team(team_id, meta):
        """Look the team up in the six competitions' team lists, one list at a time.

        Lists are cached for 24 h and fetched at low priority, so a cold process never spends
        the calls reserved for the home views. Stops at the first list that has the team.
        Returns (team or None, first_error). A team is only known not to exist once every list
        has been read; until then the caller gets the error that stopped the search.
        """
        first_error = None
        for code in TEAM_SEARCH_ORDER:
            try:
                data = meta.add(
                    client.get("/competitions/%s/teams" % code, TTL_INDEX, check=shape.ok_teams, low_priority=True)
                )
            except NotFound:
                continue
            except SOFT_FAILURES as exc:
                first_error = first_error or exc
                continue
            for t in data["teams"]:
                if t["id"] == team_id:
                    return t, code, first_error
        return None, None, first_error

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
        info, found_in, list_error = find_team(team_id, meta)
        if info is None:
            if list_error is not None:
                raise list_error
            raise HTTPException(404, "Unknown team")
        if list_error is not None:
            meta.partial = True  # a list could not be read before the team turned up

        try:
            data = meta.add(client.get("/teams/%d/matches" % team_id, TTL_MATCHES, check=shape.ok_matches, low_priority=True))
            matches = sorted(data["matches"], key=lambda m: m.get("utcDate") or "")
        except SOFT_FAILURES:
            matches, meta.partial = [], True
        finished = [m for m in matches if shape.result_for(team_id, m)]
        upcoming = [m for m in matches if m.get("status") in shape.UPCOMING_STATUSES]
        recent = []
        for m in finished[-5:]:
            entry = {**shape.match(m), "result": shape.result_for(team_id, m)}
            shootout = shape.shootout_for(team_id, m)
            if shootout:
                entry["shootout"] = shootout
            recent.append(entry)

        # Positions come from cached league tables; at most one table is fetched cold, so
        # the whole page costs no more than two upstream calls. A table left out is partial.
        running = [c.get("code") for c in info.get("runningCompetitions") or []]
        codes = [c for c in CODES if c in running] or [found_in]
        positions, cold = [], 1
        for code in codes:
            try:
                table = standings_for(code, meta, cache_only=True, low_priority=True)
            except CacheMiss:
                if cold <= 0:
                    meta.partial = True
                    continue
                cold -= 1
                try:
                    table = standings_for(code, meta, low_priority=True)
                except NotFound:
                    continue  # this competition has no table (a cup)
                except SOFT_FAILURES:
                    meta.partial = True
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

    # The built front end, when there is one: real files as they are, any other page
    # (a deep link like /club/109) gets index.html and the router takes over.
    root = FsPath(dist or os.environ.get("FRONTEND_DIST") or DEFAULT_DIST).resolve()
    if (root / "index.html").is_file():

        @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
        def front_end(path: str):
            if path == "api" or path.startswith("api/"):
                return error(404, "Not found")
            try:
                target = (root / path).resolve()
                is_file = bool(path) and target.is_file() and root in target.parents
            except (ValueError, OSError):  # NUL byte, name too long
                return error(404, "Not found")
            if is_file:
                headers = {"Cache-Control": "public, max-age=31536000, immutable"} if path.startswith("assets/") else None
                return FileResponse(target, headers=headers)
            if path.startswith("assets/"):
                return error(404, "Not found")  # a build file that is gone, not a page
            return FileResponse(root / "index.html", headers={"Cache-Control": "no-cache"})

    return app


# Built lazily so importing the module (tests, tooling) does not open a database.
def __getattr__(name):
    if name == "app":
        global app
        app = create_app()
        return app
    raise AttributeError(name)
