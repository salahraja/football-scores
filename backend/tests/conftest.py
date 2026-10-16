import json
import pathlib

import pytest
from fastapi.testclient import TestClient

from football.app import create_app
from football.cache import Cache
from football.client import FootballClient

FIXTURES = pathlib.Path(__file__).parent / "fixtures"
KEY = "test-key-9f3a1c7e5b2d4086"

# 2022-05-14 12:00 UTC, the day the fixtures are set on.
START = 1652529600.0


def fixture(name):
    return json.loads((FIXTURES / name).read_text())


class Clock:
    def __init__(self, t=START):
        self.t = t

    def __call__(self):
        return self.t

    def advance(self, seconds):
        self.t += seconds


class FakeResponse:
    def __init__(self, status_code=200, body=None):
        self.status_code = status_code
        self._body = body

    def json(self):
        if self._body is None:
            raise ValueError("no body")
        return self._body


class FakeUpstream:
    """Stands in for httpx.get. Routes are (path, matchday-or-None) -> fixture file."""

    def __init__(self):
        self.calls = []  # (url, params, headers)
        self.unreadable = False  # reply 200 with a body that is not JSON
        self.fail = None  # set to an exception or a status code to make every call fail
        self.routes = {
            "/matches": "matches_today.json",
            "/competitions/SA": "competition_SA.json",
            "/competitions/PL/standings": "standings_PL.json",
            "/teams/65": "team_65.json",
            "/teams/65/matches": "team_65_matches.json",
        }

    def paths(self):
        return [c[0].split("/v4", 1)[1] for c in self.calls]

    def __call__(self, url, params, headers):
        self.calls.append((url, dict(params or {}), dict(headers)))
        if isinstance(self.fail, Exception):
            raise self.fail
        if self.fail:
            return FakeResponse(self.fail)
        if self.unreadable:
            return FakeResponse(200, None)
        path = url.split("/v4", 1)[1]
        if path == "/competitions/SA/matches":
            name = "matches_SA_md%s.json" % (params or {}).get("matchday")
            if not (FIXTURES / name).exists():
                return FakeResponse(404, {"message": "not found"})
            return FakeResponse(200, fixture(name))
        if path in self.routes:
            return FakeResponse(200, fixture(self.routes[path]))
        return FakeResponse(404, {"message": "not found"})


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def upstream():
    return FakeUpstream()


@pytest.fixture
def make_client(clock, upstream):
    def make(api_key=KEY):
        return FootballClient(api_key=api_key, cache=Cache(), clock=clock, http_get=upstream)

    return make


@pytest.fixture
def api(make_client):
    return TestClient(create_app(make_client()))

