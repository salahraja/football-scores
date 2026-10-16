"""The single door to football-data.org: cache, single flight, rate limit, key handling."""
import json
import logging
import threading
import time
from dataclasses import dataclass

import httpx

from .cache import Cache
from .ratelimit import RateLimiter

log = logging.getLogger("football.client")

BASE_URL = "https://api.football-data.org/v4"
MAX_CALLS_PER_MINUTE = 9  # the free tier allows 10; keep one in hand

TTL_LIVE = 60  # today / live scores
TTL_MATCHES = 5 * 60
TTL_STANDINGS = 10 * 60
TTL_TEAMS = 60 * 60
TTL_INDEX = 24 * 60 * 60  # which teams play in which competition

# Of the 9 calls a minute, this many are kept back for the home views (today, standings,
# matches). Matches cost two calls (competition detail, then the matches), so today +
# standings + matches need four. Team pages may only spend what is left.
HOME_RESERVE = 4
FLIGHT_WAIT = 12  # seconds a request waits on another request's upstream call

MAX_STALE = 24 * 60 * 60  # an expired copy older than this is never served


class MissingKey(Exception):
    """FOOTBALL_DATA_KEY is not set and the data was not cached."""


class UpstreamError(Exception):
    """football-data.org failed or is unreachable. The message is safe to show."""


class UpstreamBusy(Exception):
    """football-data.org said 429."""


class NotFound(Exception):
    """football-data.org has no such resource."""


class RateLimited(Exception):
    """The call budget is spent and nothing is cached for this request."""


class Unavailable(Exception):
    """Cannot answer now and the only cached copy is too old to serve."""


class CacheMiss(Exception):
    """cache_only was asked for and there is no fresh copy."""


@dataclass
class Fetched:
    body: object
    fetched_at: float
    stale: bool


class _Flight:
    def __init__(self):
        self.done = threading.Event()
        self.result = None
        self.error = None


def _http_get(url, params, headers):
    return httpx.get(url, params=params, headers=headers, timeout=10.0)


class FootballClient:
    def __init__(self, api_key=None, cache=None, clock=time.time, http_get=_http_get, monotonic=time.monotonic):
        self._api_key = api_key or None
        self.cache = cache or Cache()
        self.clock = clock  # wall time: stamps cache entries
        self.monotonic = monotonic  # steady time: the call budget
        self._http_get = http_get
        self.limiter = RateLimiter(MAX_CALLS_PER_MINUTE, 60, monotonic)
        self._flights = {}
        self._flights_lock = threading.Lock()

    def get(self, path, ttl, params=None, check=None, cache_only=False, low_priority=False):
        """Return Fetched. Fresh cache, else one upstream call, else a stale copy, else raise.

        check(body) -> bool vets an upstream body before it is cached.
        cache_only: fresh cache or CacheMiss, never an upstream call.
        low_priority: may not use the calls reserved for the home views.
        """
        params = {k: v for k, v in (params or {}).items() if v is not None}
        key = path + "?" + json.dumps(params, sort_keys=True)
        fresh = self._fresh(key, ttl)
        if fresh:
            return fresh
        if cache_only:
            raise CacheMiss(key)

        # Single flight: concurrent cold requests for one key share one upstream call.
        with self._flights_lock:
            flight = self._flights.get(key)
            leader = flight is None
            if leader:
                flight = self._flights[key] = _Flight()
        if not leader:
            if not flight.done.wait(FLIGHT_WAIT):
                raise UpstreamBusy("The football data provider is busy; try again in a minute")
            if flight.error is not None:
                raise flight.error
            return flight.result
        try:
            # Another flight may have finished between our cache read and registering.
            flight.result = self._fresh(key, ttl) or self._load(key, path, params, check, low_priority)
            return flight.result
        except BaseException as exc:
            flight.error = exc
            raise
        finally:
            with self._flights_lock:
                del self._flights[key]
            flight.done.set()

    def _fresh(self, key, ttl):
        floor = self.clock() - ttl
        entry = self.cache.get(key, min_fetched_at=floor)
        if entry and entry[0] > floor:
            return Fetched(entry[1], entry[0], False)
        return None

    def _load(self, key, path, params, check, low_priority):
        try:
            body = self._fetch(path, params, check, low_priority)
        except (RateLimited, UpstreamError, UpstreamBusy) as exc:
            entry = self.cache.get(key)
            if entry is None:
                raise
            if self.clock() - entry[0] > MAX_STALE:
                raise Unavailable("The football data is temporarily unavailable") from exc
            return Fetched(entry[1], entry[0], True)
        now = self.clock()
        self.cache.put(key, now, body)
        return Fetched(body, now, False)

    def _fetch(self, path, params, check, low_priority):
        if not self._api_key:
            raise MissingKey("FOOTBALL_DATA_KEY is not set on the server")
        if not self.limiter.try_acquire(HOME_RESERVE if low_priority else 0):
            raise RateLimited("Too many requests to the data provider; try again in a minute")
        try:
            resp = self._http_get(BASE_URL + path, params, {"X-Auth-Token": self._api_key})
        except httpx.HTTPError as exc:
            log.warning("upstream unreachable: %s %s", path, type(exc).__name__)
            raise UpstreamError("The football data provider could not be reached") from None
        if resp.status_code != 200:
            log.warning("upstream status %s for %s", resp.status_code, path)
            if resp.status_code == 404:
                raise NotFound("The football data provider has no data for that request")
            if resp.status_code == 429:
                raise UpstreamBusy("The football data provider is busy; try again in a minute")
            raise UpstreamError("The football data provider returned an error (%s)" % resp.status_code)
        try:
            body = resp.json()
        except ValueError:
            raise UpstreamError("The football data provider sent an unreadable reply") from None
        if check is not None and not check(body):
            log.warning("upstream body of unexpected shape for %s", path)
            raise UpstreamError("The football data provider sent a reply in an unexpected shape")
        return body
