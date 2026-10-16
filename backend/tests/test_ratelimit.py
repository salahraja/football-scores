from conftest import Clock
from football.ratelimit import RateLimiter


def test_window_allows_nine_then_refuses_then_recovers():
    clock = Clock()
    rl = RateLimiter(9, 60, clock)
    assert [rl.try_acquire() for _ in range(10)] == [True] * 9 + [False]
    clock.advance(59)
    assert rl.try_acquire() is False
    clock.advance(1)
    assert rl.try_acquire() is True


def test_never_more_than_nine_in_any_minute():
    clock = Clock()
    rl = RateLimiter(9, 60, clock)
    granted = []
    for _ in range(300):  # one try every 2 s for 10 minutes
        if rl.try_acquire():
            granted.append(clock())
        clock.advance(2)
    for t in granted:
        assert len([g for g in granted if t <= g < t + 60]) <= 9


def test_ten_rapid_requests_make_at_most_nine_upstream_calls(api, upstream):
    # Ten different matchdays are ten different cache keys, so nothing is served from cache.
    # (Matchday 30 and 34 have fixtures; the rest 404 upstream, which still counts as a call.)
    for md in range(1, 11):
        api.get("/api/competitions/SA/matches?matchday=%d" % md)
    assert len(upstream.calls) <= 9


def test_empty_budget_serves_stale_cache(api, upstream, clock):
    first = api.get("/api/competitions/PL/standings").json()
    assert first["stale"] is False
    clock.advance(11 * 60)  # expired
    for md in range(1, 9):  # spend the rest of the budget
        api.get("/api/competitions/SA/matches?matchday=%d" % md)
    used = len(upstream.calls)
    r = api.get("/api/competitions/PL/standings")
    assert r.status_code == 200
    body = r.json()
    assert body["stale"] is True
    assert body["table"] == first["table"]
    assert r.headers["X-Stale"] == "true"
    assert len(upstream.calls) == used  # no upstream call was made


def test_empty_budget_and_no_cache_is_429(api, upstream):
    for md in range(1, 10):
        api.get("/api/competitions/SA/matches?matchday=%d" % md)
    r = api.get("/api/competitions/PL/standings")
    assert r.status_code == 429
    assert "error" in r.json()


def test_stale_array_response_uses_header(api, upstream, clock):
    api.get("/api/today")
    clock.advance(61)
    upstream.fail = 500
    r = api.get("/api/today")
    assert r.status_code == 200 and r.headers["X-Stale"] == "true"
    assert r.json()["stale"] is True


def test_upstream_down_serves_stale_when_cached(api, upstream, clock):
    api.get("/api/teams/65")
    clock.advance(2 * 60 * 60)
    upstream.fail = 500
    body = api.get("/api/teams/65").json()
    assert body["stale"] is True and body["team"]["id"] == 65
