"""Champions League knockout rounds: ?stage= on the matches route, and the stages a competition has."""
import pytest
from conftest import KEY, START, Clock, FakeResponse, FakeUpstream, fixture
from fastapi.testclient import TestClient

from football.app import create_app
from football.cache import Cache
from football.client import FootballClient

CL = "/api/competitions/CL/matches"


def m(mid, stage, matchday, status="FINISHED"):
    base = fixture("matches_CL_md8.json")["matches"][0]
    return {**base, "id": mid, "stage": stage, "matchday": matchday, "status": status}


# Shaped like the v4 docs: league-phase games carry a matchday, knockout ones may carry none.
SEASON = [
    m(1, "LEAGUE_STAGE", 1), m(2, "LEAGUE_STAGE", 8),
    m(3, "PLAYOFFS", None), m(4, "LAST_16", None), m(5, "LAST_16", None, "TIMED"),
    m(6, "QUARTER_FINALS", None, "TIMED"), m(7, "FINAL", None, "TIMED"),
]


class StageUpstream(FakeUpstream):
    """Filters the season by the stage and matchday params, as football-data.org does."""

    def __call__(self, url, params, headers):
        if url.endswith("/competitions/CL/matches"):
            self.calls.append((url, dict(params or {}), dict(headers)))
            params = params or {}
            out = [x for x in SEASON
                   if x["stage"] == params.get("stage", x["stage"])
                   and x["matchday"] == params.get("matchday", x["matchday"])]
            return FakeResponse(200, {"matches": out})
        return super().__call__(url, params, headers)


@pytest.fixture
def stage_api():
    up = StageUpstream()
    clock = Clock(START)
    client = FootballClient(api_key=KEY, cache=Cache(), clock=clock, monotonic=clock, http_get=up)
    return TestClient(create_app(client)), up


def test_stage_is_passed_to_upstream_and_filters(stage_api):
    api, up = stage_api
    r = api.get(CL, params={"stage": "LAST_16"})
    assert r.status_code == 200
    body = r.json()
    assert [x["id"] for x in body["matches"]] == [4, 5]
    assert body["stage"] == "LAST_16"
    sent = [p for u, p, h in up.calls if u.endswith("/competitions/CL/matches") and p.get("stage")]
    assert sent == [{"stage": "LAST_16"}]  # no matchday forced on a knockout round


def test_stages_lists_only_stages_that_have_matches_in_order(stage_api):
    api, _ = stage_api
    body = api.get(CL, params={"stage": "FINAL"}).json()
    assert body["stages"] == ["LEAGUE_STAGE", "PLAYOFFS", "LAST_16", "QUARTER_FINALS", "FINAL"]


def test_unknown_stage_is_a_422_and_makes_no_upstream_call(stage_api):
    api, up = stage_api
    for bad in ["NOPE", "last_16", "LAST_16;x", ""]:
        assert api.get(CL, params={"stage": bad}).status_code == 422, bad
    assert up.calls == []


@pytest.mark.parametrize("name", ["CLAUSURA", "APERTURA", "CHAMPIONSHIP", "RELEGATION", "RELEGATION_ROUND",
                                  "THIRD_PLACE", "GROUP_STAGE", "REGULAR_SEASON", "LEAGUE_STAGE"])
def test_every_documented_stage_name_is_accepted(stage_api, name):
    api, _ = stage_api
    assert api.get(CL, params={"stage": name}).status_code == 200


def test_other_competitions_have_no_stage_list(api):
    body = api.get("/api/competitions/SA/matches").json()
    assert body["stages"] == []
    assert body["stage"] is None
