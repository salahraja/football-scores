"""Round-2 review fixes."""
import asyncio
import threading

import httpx
from conftest import FakeResponse, fixture
from fastapi.testclient import TestClient

from football import client as client_module
from football.app import create_app
from football.ratelimit import PerKeyLimiter


def test_cold_team_page_leaves_room_for_the_home_views(api, upstream):
    assert api.get("/api/teams/65").status_code == 200
    for url in ["/api/today", "/api/competitions/SA/standings", "/api/competitions/SA/matches"]:
        r = api.get(url)
        assert r.status_code == 200, url
    assert len(upstream.calls) <= 9


def test_team_index_is_built_one_list_at_a_time_in_order_and_stops_when_found(api, upstream):
    api.get("/api/teams/65")
    lists = [p for p in upstream.paths() if p.endswith("/teams")]
    assert lists == ["/competitions/SA/teams", "/competitions/PL/teams"]  # PL has team 65: stop


def test_budget_exhausted_mid_page_gives_a_partial_page_not_an_error(api, upstream):
    for md in range(1, 6):  # home views use 5 of the 9 calls
        api.get("/api/competitions/SA/matches?matchday=%d" % md)
    assert len(upstream.calls) == 6  # the competition detail plus five matchdays
    r = api.get("/api/teams/65")
    assert r.status_code in (200, 429)
    assert len(upstream.calls) <= 9
    # the reserve is still there for the home views
    assert api.get("/api/today").status_code == 200


def test_a_failed_list_marks_the_page_partial(make_client, upstream):
    orig = upstream.__call__

    def call(url, params, headers):
        if url.endswith("/competitions/SA/teams"):
            upstream.calls.append((url, params, headers))
            return FakeResponse(500)
        return orig(url, params, headers)

    client = make_client()
    client._http_get = call
    body = TestClient(create_app(client)).get("/api/teams/65").json()
    assert body["team"]["id"] == 65 and body["partial"] is True


def test_a_failed_cl_table_is_marked_partial_not_silently_dropped(make_client, upstream):
    orig = upstream.__call__

    def call(url, params, headers):
        if url.endswith(("/competitions/CL/teams", "/competitions/CL/standings")):
            return FakeResponse(500)
        return orig(url, params, headers)

    client = make_client()
    client._http_get = call
    api = TestClient(create_app(client))
    api.get("/api/competitions/PL/standings")
    body = api.get("/api/teams/65").json()
    assert body["positions"] == [{"competition": "PL", "position": 1, "points": 90}]
    assert body["partial"] is True  # CL (which the team plays in) has no position


def test_home_views_are_not_partial(api):
    assert api.get("/api/today").json()["partial"] is False
    assert api.get("/api/competitions/PL/standings").json()["partial"] is False


def test_shootout_winner_is_marked_on_recent_matches_but_result_stays_a_draw(api, upstream, clock):
    data = fixture("team_65_matches.json")
    for team_is_home, expected in ((True, "W"), (False, "L")):
        shootout = fixture("matches_CL_md8.json")["matches"][2]  # pens 6-5 to the home side
        home, away = (65, 1) if team_is_home else (1, 65)
        shootout["homeTeam"]["id"], shootout["awayTeam"]["id"] = home, away
        shootout["utcDate"] = "2023-01-01T00:00:00Z"
        d = dict(data, matches=data["matches"] + [shootout])
        upstream.override["/teams/65/matches"] = d
        clock.advance(301)  # fixtures expire (5 min); the team list and tables stay cached
        top = api.get("/api/teams/65").json()["recentMatches"][0]
        assert top["result"] == "D" and top["shootout"] == expected
    plain = api.get("/api/teams/65").json()["recentMatches"][1]
    assert "shootout" not in plain


def test_a_waiter_gives_up_after_its_own_timeout(make_client, upstream, monkeypatch):
    monkeypatch.setattr(client_module, "FLIGHT_WAIT", 0.2)
    gate = threading.Event()
    orig = upstream.__call__

    def slow(url, params, headers):
        gate.wait(5)
        return orig(url, params, headers)

    client = make_client()
    client._http_get = slow
    app = create_app(client)

    async def burst():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as ac:
            first = asyncio.ensure_future(ac.get("/api/competitions/PL/standings"))
            await asyncio.sleep(0.1)
            late = await ac.get("/api/competitions/PL/standings")
            gate.set()
            return late, await first

    late, first = asyncio.run(burst())
    assert late.status_code == 503 and "busy" in late.json()["error"].lower()
    assert first.status_code == 200


def test_per_key_limiter_evicts_the_oldest_key_only():
    lim = PerKeyLimiter(1, 60, lambda: 0.0)
    lim.MAX_KEYS = 3
    for k in "abc":
        assert lim.try_acquire(k)
    assert lim.try_acquire("d")  # evicts "a", keeps b and c
    assert not lim.try_acquire("b") and not lim.try_acquire("c")  # still remembered, still limited
    assert lim.try_acquire("a")  # was evicted, starts fresh
