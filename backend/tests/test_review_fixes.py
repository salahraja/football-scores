"""Round-1 review fixes: one test group per finding."""
import asyncio

import httpx
import psycopg
import pytest
from conftest import KEY, START, Clock, fixture
from fastapi.testclient import TestClient

from football.app import create_app
from football.cache import Cache
from football.client import FootballClient

CL = "/api/competitions/CL/matches"


def get_by_id(body, match_id):
    return next(m for m in body["matches"] if m["id"] == match_id)


# 1. CORS and the today envelope ---------------------------------------------------------

def test_x_stale_is_exposed_to_browsers(api, upstream, clock):
    api.get("/api/today")
    clock.advance(61)
    upstream.fail = 500
    r = api.get("/api/today", headers={"Origin": "http://localhost:5173"})
    assert r.headers["x-stale"] == "true"
    assert "X-Stale" in r.headers["access-control-expose-headers"]


# 2. Single flight -----------------------------------------------------------------------

def test_concurrent_cold_requests_make_one_upstream_call(make_client, upstream):
    upstream.delay = 0.05
    app = create_app(make_client())

    async def burst():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://t") as ac:
            return await asyncio.gather(*[ac.get("/api/competitions/PL/standings") for _ in range(40)])

    responses = asyncio.run(burst())
    assert [r.status_code for r in responses] == [200] * 40
    assert len(upstream.calls) == 1


def test_a_failed_flight_wakes_the_waiters_and_is_not_cached(make_client, upstream):
    upstream.delay = 0.05
    upstream.fail = 500
    app = create_app(make_client())

    async def burst():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as ac:
            return await asyncio.gather(*[ac.get("/api/competitions/PL/standings") for _ in range(10)])

    assert {r.status_code for r in asyncio.run(burst())} == {502}
    assert len(upstream.calls) == 1
    upstream.fail = None
    assert TestClient(app).get("/api/competitions/PL/standings").status_code == 200


# 3. Team ids ----------------------------------------------------------------------------

def test_unknown_team_is_404_once_the_index_is_complete(api, upstream, clock):
    # Cold: five lists fit in the budget left after the reserve for the home views, the sixth does not.
    assert api.get("/api/teams/424242").status_code == 429
    assert len(upstream.calls) == 5
    clock.advance(61)
    assert api.get("/api/teams/424242").status_code == 404  # the sixth list arrives
    assert set(upstream.paths()) == {"/competitions/%s/teams" % c for c in ["PL", "PD", "BL1", "SA", "FL1", "CL"]}
    used = len(upstream.calls)
    for _ in range(5):
        assert api.get("/api/teams/424242").status_code == 404
    assert len(upstream.calls) == used  # now answered from the cache, no calls


def test_team_page_costs_at_most_two_cold_calls_once_its_list_is_cached(api, upstream):
    body = api.get("/api/teams/65").json()
    assert body["positions"] == [{"competition": "PL", "position": 1, "points": 90}]
    # CL standings were not fetched to stay inside the budget: partial data, but not old data.
    assert body["partial"] is True and body["stale"] is False
    before = len(upstream.calls)
    assert api.get("/api/teams/64").status_code == 200
    new = upstream.paths()[before:]
    assert len(new) <= 2 and "/competitions/PL/standings" not in new and "/competitions/PL/teams" not in new


def test_team_data_comes_from_the_index(api):
    body = api.get("/api/teams/65").json()
    assert body["team"]["venue"] == "Etihad Stadium" and body["team"]["founded"] == 1880


def test_team_index_incomplete_and_not_found_is_an_error_not_a_404(api, upstream):
    upstream.fail = 500
    assert api.get("/api/teams/424242").status_code == 502


def test_teams_are_limited_per_client(api, upstream):
    codes = [api.get("/api/teams/65").status_code for _ in range(31)]
    assert codes[:30] == [200] * 30 and codes[30] == 429  # 30 per minute
    assert api.get("/api/competitions").status_code == 200  # other routes are not limited


# 4. Football correctness ----------------------------------------------------------------

def cup(api):
    return api.get(CL).json()


def test_regular_result(api):
    m = get_by_id(cup(api), 4001)
    assert m["score"] == {"home": 2, "away": 1, "duration": "REGULAR"}


def test_extra_time_result_is_regular_plus_extra_time(api):
    m = get_by_id(cup(api), 4002)
    assert m["score"] == {"home": 2, "away": 1, "duration": "EXTRA_TIME"}


def test_shootout_is_shown_separately_never_summed(api):
    m = get_by_id(cup(api), 4003)
    # the docs' sample: fullTime 7-6, regularTime 1-1, extraTime 0-0, penalties 6-5
    assert m["score"] == {"home": 1, "away": 1, "duration": "PENALTY_SHOOTOUT",
                          "penalties": {"home": 6, "away": 5}}


def test_live_overtime_statuses_carry_minute_and_injury_time_as_integers(api):
    body = cup(api)
    et = get_by_id(body, 4004)
    assert et["status"] == "EXTRA_TIME" and et["minute"] == 105 and "injuryTime" not in et
    assert et["score"] == {"home": 1, "away": 1, "duration": "EXTRA_TIME"}
    pens = get_by_id(body, 4005)
    assert pens["minute"] == 120 and pens["injuryTime"] == 2
    assert pens["score"]["penalties"] == {"home": 3, "away": 2}
    assert pens["score"]["home"] == 1 and pens["score"]["away"] == 1
    sus = get_by_id(body, 4006)
    assert sus["status"] == "SUSPENDED" and sus["minute"] == 34


def test_minute_is_an_integer_when_the_api_sends_a_string(api, upstream):
    data = fixture("matches_today.json")
    data["matches"][1]["minute"] = "67"
    data["matches"][1]["injuryTime"] = "3"
    upstream.override["/matches"] = data
    live = api.get("/api/today").json()["matches"][1]
    assert live["minute"] == 67 and live["injuryTime"] == 3


def test_next_match_includes_a_live_extra_time_game(api, upstream):
    data = fixture("team_65_matches.json")
    data["matches"][-2]["status"] = "EXTRA_TIME"
    upstream.override["/teams/65/matches"] = data
    assert api.get("/api/teams/65").json()["nextMatch"]["status"] == "EXTRA_TIME"


def test_form_result_for_a_shootout_is_a_draw(api, upstream):
    data = fixture("team_65_matches.json")
    shootout = fixture("matches_CL_md8.json")["matches"][2]
    shootout["homeTeam"]["id"], shootout["awayTeam"]["id"] = 65, 1
    shootout["utcDate"] = "2023-01-01T00:00:00Z"
    data["matches"].append(shootout)
    upstream.override["/teams/65/matches"] = data
    recent = api.get("/api/teams/65").json()["recentMatches"]
    assert recent[0]["id"] == 4003 and recent[0]["result"] == "D"
    assert recent[0]["score"]["penalties"] == {"home": 6, "away": 5}


# 5. Zones -------------------------------------------------------------------------------

def test_zones_for_2026_27():
    from football.competitions import ZONES

    assert ZONES["PL"]["championsLeague"]["to"] == 5 and "conferenceLeague" in ZONES["PL"]
    assert ZONES["PD"]["championsLeague"]["to"] == 5
    assert ZONES["FL1"]["championsLeague"]["to"] == 3
    assert ZONES["FL1"]["championsLeagueQualifying"] == {
        "label": "Champions League qualifying (league path)", "from": 4, "to": 4}
    assert ZONES["SA"]["championsLeague"]["to"] == 4 and ZONES["BL1"]["championsLeague"]["to"] == 4


# 6. Staleness ---------------------------------------------------------------------------

def test_stale_responses_say_when_they_were_fetched_and_how_old(api, upstream, clock):
    api.get("/api/competitions/PL/standings")
    clock.advance(11 * 60)
    upstream.fail = 500
    body = api.get("/api/competitions/PL/standings").json()
    assert body["stale"] is True and body["age"] == 660
    assert body["fetchedAt"] == "2022-05-14T12:00:00Z"


def test_nothing_older_than_24_hours_is_served_stale(api, upstream, clock):
    api.get("/api/competitions/PL/standings")
    upstream.fail = 500
    clock.advance(24 * 3600)
    assert api.get("/api/competitions/PL/standings").status_code == 200  # exactly 24 h: still ok
    clock.advance(1)
    r = api.get("/api/competitions/PL/standings")
    assert r.status_code == 503 and list(r.json()) == ["error"]


def test_upstream_404_is_a_404_and_never_served_stale(api, upstream, clock):
    api.get("/api/competitions/PL/standings")
    clock.advance(11 * 60)
    upstream.fail = 404
    r = api.get("/api/competitions/PL/standings")
    assert r.status_code == 404 and list(r.json()) == ["error"]


def test_upstream_429_is_a_busy_503(api, upstream):
    upstream.fail = 429
    r = api.get("/api/competitions/PL/standings")
    assert r.status_code == 503 and "busy" in r.json()["error"].lower()


# 7. Postgres pool and breaker -----------------------------------------------------------

class DownPool:
    def __init__(self):
        self.attempts = 0

    def connection(self):
        self.attempts += 1
        raise psycopg.OperationalError("db down")

    def close(self):
        pass


def test_a_database_failure_trips_a_60_second_breaker():
    clock = Clock(0)
    pool = DownPool()
    cache = Cache("postgresql://ignored", pool=pool, clock=clock)
    assert pool.attempts == 1  # the DDL at startup failed
    cache.put("k", 1.0, {"a": 1})
    assert cache.get("k") == (1.0, {"a": 1})  # memory keeps working
    assert pool.attempts == 1  # breaker open: no new attempts
    clock.advance(59)
    cache.get("k")
    assert pool.attempts == 1
    clock.advance(1)
    cache.get("k")
    assert pool.attempts == 2  # half-open: one retry, fails again
    cache.get("k")
    assert pool.attempts == 2  # and the breaker is open again


def test_fresh_memory_entries_skip_the_database():
    pool = DownPool()
    cache = Cache("postgresql://ignored", pool=pool, clock=Clock(0))
    cache.put("k", 100.0, {"a": 1})
    pool.attempts = 0
    assert cache.get("k", min_fetched_at=50.0) == (100.0, {"a": 1})
    assert pool.attempts == 0


# Minor ----------------------------------------------------------------------------------

@pytest.mark.parametrize("body", [{"matches": None}, [1, 2], {"matches": [1]}])
def test_odd_shaped_200_is_a_502_and_not_cached(api, upstream, body):
    upstream.override["/competitions/PL/standings"] = {"standings": [{"type": "TOTAL", "table": None}], "season": None}
    r = api.get("/api/competitions/PL/standings")
    assert r.status_code == 502 and list(r.json()) == ["error"]
    upstream.override.clear()
    assert api.get("/api/competitions/PL/standings").status_code == 200  # the bad body was not kept
    upstream.override["/matches"] = body
    assert api.get("/api/today").status_code == 502


def test_unexpected_errors_are_a_plain_json_error(make_client, monkeypatch):
    from football import shape

    monkeypatch.setattr(shape, "standings", lambda *a: 1 / 0)
    api = TestClient(create_app(make_client()), raise_server_exceptions=False)
    r = api.get("/api/competitions/PL/standings")
    assert r.status_code == 500 and r.json() == {"error": "Something went wrong on the server"}


def test_limiter_uses_the_monotonic_clock_not_wall_time(upstream):
    wall, mono = Clock(START), Clock(0)
    client = FootballClient(api_key=KEY, cache=Cache(), clock=wall, monotonic=mono, http_get=upstream)
    for md in range(1, 10):
        try:
            client.get("/competitions/SA/matches", 1, {"matchday": md})
        except Exception:
            pass
    wall.advance(-3600)  # the wall clock jumping back changes nothing
    assert len(upstream.calls) == 9
    from football.client import RateLimited

    with pytest.raises(RateLimited):
        client.get("/competitions/SA/matches", 1, {"matchday": 99})
    mono.advance(60)
    with pytest.raises(Exception) as exc:  # budget is back, so this reaches the (404) fake
        client.get("/competitions/SA/matches", 1, {"matchday": 99})
    assert not isinstance(exc.value, RateLimited)


def test_null_current_matchday_uses_the_latest_played_matchday(api, upstream):
    body = api.get("/api/competitions/PD/matches").json()
    assert body["currentMatchday"] is None and body["matchday"] == 2
    assert [m["id"] for m in body["matches"]] == [3002]
    # the whole-season list is fetched once, not once for the lookup and again for the answer
    assert upstream.paths().count("/competitions/PD/matches") == 1
    assert "matchday" not in upstream.calls[-1][1]


def test_readme_has_no_vercel_section():
    import pathlib

    readme = (pathlib.Path(__file__).parents[2] / "README.md").read_text()
    assert "Deploy on Vercel" not in readme
