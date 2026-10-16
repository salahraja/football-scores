"""The single door to football-data.org: cache, rate limit, key handling."""
import json
import logging
import time

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


class MissingKey(Exception):
    """FOOTBALL_DATA_KEY is not set and the data was not cached."""


class UpstreamError(Exception):
    """football-data.org failed or is unreachable. The message is safe to show."""


class RateLimited(Exception):
    """The call budget is spent and nothing is cached for this request."""


def _http_get(url, params, headers):
    return httpx.get(url, params=params, headers=headers, timeout=10.0)


class FootballClient:
    def __init__(self, api_key=None, cache=None, clock=time.time, http_get=_http_get):
        self._api_key = api_key or None
        self.cache = cache or Cache()
        self.clock = clock
        self._http_get = http_get
        self.limiter = RateLimiter(MAX_CALLS_PER_MINUTE, 60, clock)

    def get(self, path, ttl, params=None):
        """Return (body, stale). Fresh cache, else upstream, else stale cache, else raise."""
        params = {k: v for k, v in (params or {}).items() if v is not None}
        key = path + "?" + json.dumps(params, sort_keys=True)
        entry = self.cache.get(key)
        if entry and self.clock() - entry[0] < ttl:
            return entry[1], False

        try:
            body = self._fetch(path, params)
        except (RateLimited, UpstreamError):
            if entry:
                return entry[1], True
            raise
        self.cache.put(key, self.clock(), body)
        return body, False

    def _fetch(self, path, params):
        if not self._api_key:
            raise MissingKey("FOOTBALL_DATA_KEY is not set on the server")
        if not self.limiter.try_acquire():
            raise RateLimited("Too many requests to the data provider; try again in a minute")
        try:
            resp = self._http_get(
                BASE_URL + path, params, {"X-Auth-Token": self._api_key}
            )
        except httpx.HTTPError as exc:
            log.warning("upstream unreachable: %s %s", path, type(exc).__name__)
            raise UpstreamError("The football data provider could not be reached") from None
        if resp.status_code != 200:
            log.warning("upstream status %s for %s", resp.status_code, path)
            if resp.status_code == 404:
                raise UpstreamError("The football data provider has no data for that request")
            raise UpstreamError(
                "The football data provider returned an error (%s)" % resp.status_code
            )
        try:
            return resp.json()
        except ValueError:
            raise UpstreamError("The football data provider sent an unreadable reply") from None
