import json
import pathlib
import time

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
    """Stands in for httpx.get; serves the fixtures by path."""

    def __init__(self):
        self.calls = []  # (url, params, headers)
        self.unreadable = False  # reply 200 with a body that is not JSON
        self.fail = None  # set to an exception or a status code to make every call fail
        self.delay = 0  # seconds each call takes (for concurrency tests)
        self.override = {}  # path -> body, wins over the fixtures
        self.routes = {
            "/matches": "matches_today.json",
            "/competitions/SA": "competition_SA.json",
            "/competitions/CL": "competition_CL.json",
            "/competitions/PD": "competition_PD.json",
            "/competitions/PL/standings": "standings_PL.json",
            "/competitions/PL/teams": "teams_PL.json",
            "/competitions/CL/teams": "teams_CL.json",
            "/competitions/SA/teams": "teams_SA.json",
            "/competitions/PD/matches": "matches_PD_all.json",
            "/teams/65/matches": "team_65_matches.json",
            "/teams/64/matches": "team_65_matches.json",  # content is City's; only the route matters
        }

    def paths(self):
        return [c[0].split("/v4", 1)[1] for c in self.calls]

    def __call__(self, url, params, headers):
        self.calls.append((url, dict(params or {}), dict(headers)))
        if self.delay:
            time.sleep(self.delay)
        if isinstance(self.fail, Exception):
            raise self.fail
        if self.fail:
            return FakeResponse(self.fail)
        if self.unreadable:
            return FakeResponse(200, None)
        path = url.split("/v4", 1)[1]
        if path in self.override:
            return FakeResponse(200, self.override[path])
        parts = path.strip("/").split("/")
        if len(parts) == 3 and parts[0] == "competitions" and parts[2] == "matches" and parts[1] != "PD":
            name = "matches_%s_md%s.json" % (parts[1], (params or {}).get("matchday"))
            if (FIXTURES / name).exists():
                return FakeResponse(200, fixture(name))
        if len(parts) == 3 and parts[2] == "teams" and path not in self.routes:
            # the other competitions: one team each, none of them the ones the tests ask about
            return FakeResponse(200, {"teams": [{"id": 9000 + len(parts[1]) * 7 + ord(parts[1][0]), "name": "T"}]})
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
        return FootballClient(
            api_key=api_key, cache=Cache(), clock=clock, monotonic=clock, http_get=upstream
        )

    return make


@pytest.fixture
def api(make_client):
    return TestClient(create_app(make_client()))
