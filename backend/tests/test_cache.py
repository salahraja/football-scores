import pytest


def count(upstream, path):
    return upstream.paths().count(path)


# (url, upstream path that carries the TTL, ttl seconds)
CASES = [
    ("/api/today", "/matches", 60),
    ("/api/competitions/SA/matches", "/competitions/SA/matches", 5 * 60),
    ("/api/competitions/PL/standings", "/competitions/PL/standings", 10 * 60),
    ("/api/teams/65", "/teams/65", 60 * 60),
]


@pytest.mark.parametrize("url,path,ttl", CASES)
def test_ttl(api, upstream, clock, url, path, ttl):
    api.get(url)
    assert count(upstream, path) == 1
    clock.advance(ttl - 1)
    api.get(url)
    assert count(upstream, path) == 1  # still fresh
    clock.advance(1)
    api.get(url)
    assert count(upstream, path) == 2  # expired, fetched again


def test_team_matches_use_the_five_minute_ttl(api, upstream, clock):
    api.get("/api/teams/65")
    clock.advance(5 * 60)
    api.get("/api/teams/65")
    assert count(upstream, "/teams/65/matches") == 2
    assert count(upstream, "/teams/65") == 1


def test_different_matchdays_are_cached_separately(api, upstream):
    api.get("/api/competitions/SA/matches?matchday=30")
    api.get("/api/competitions/SA/matches?matchday=34")
    api.get("/api/competitions/SA/matches?matchday=30")
    assert [c[1]["matchday"] for c in upstream.calls if c[0].endswith("/matches")] == [30, 34]


def test_standings_share_cache_with_team_page(api, upstream):
    api.get("/api/teams/65")
    api.get("/api/competitions/PL/standings")
    assert count(upstream, "/competitions/PL/standings") == 1
