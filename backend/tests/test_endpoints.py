TEAM_KEYS = {"id", "name", "shortName", "crest"}
MATCH_KEYS = {"id", "competition", "utcDate", "status", "homeTeam", "awayTeam", "score"}


def test_healthz(api, upstream):
    assert api.get("/healthz").json() == {"ok": True}
    assert upstream.calls == []


def test_competitions_shape_and_no_upstream_call(api, upstream):
    body = api.get("/api/competitions").json()
    assert [c["code"] for c in body] == ["PL", "PD", "BL1", "SA", "FL1", "CL"]
    assert set(body[0]) == {"code", "name", "country", "emblem"}
    assert upstream.calls == []


def test_today_shape(api, upstream):
    r = api.get("/api/today")
    assert r.status_code == 200
    envelope = r.json()
    assert set(envelope) == {"matches", "stale", "fetchedAt", "age"}
    assert envelope["stale"] is False and envelope["fetchedAt"] == "2022-05-14T12:00:00Z"
    body = envelope["matches"]
    # The fixture has one match on the next day; it is dropped.
    assert [m["id"] for m in body] == [329400, 1003, 1004]
    for m in body:
        assert MATCH_KEYS <= set(m)
        assert set(m["homeTeam"]) == TEAM_KEYS
        assert {"home", "away"} <= set(m["score"])
        assert set(m["competition"]) == {"code", "name", "emblem"}
    live = body[1]
    assert live["status"] == "IN_PLAY" and live["minute"] == 67
    assert live["score"] == {"home": 1, "away": 1, "duration": "REGULAR"}
    assert "minute" not in body[0]  # finished match: no live minute
    assert body[2]["score"]["home"] is None and body[2]["score"]["away"] is None
    _, params, _ = upstream.calls[0]
    assert params["competitions"] == "PL,PD,BL1,SA,FL1,CL"
    assert params["dateFrom"] == "2022-05-14"


def test_matches_default_is_current_matchday(api, upstream):
    body = api.get("/api/competitions/SA/matches").json()
    assert body["matchday"] == 34 and body["currentMatchday"] == 34
    assert body["stale"] is False
    assert [m["id"] for m in body["matches"]] == [1001, 1002]
    assert MATCH_KEYS <= set(body["matches"][0])
    assert upstream.paths() == ["/competitions/SA", "/competitions/SA/matches"]
    assert upstream.calls[1][1] == {"matchday": 34}


def test_matches_explicit_matchday(api):
    body = api.get("/api/competitions/sa/matches?matchday=30").json()
    assert body["matchday"] == 30 and body["currentMatchday"] == 34
    assert body["matches"][0]["id"] == 900


def test_matches_rejects_bad_input(api):
    assert api.get("/api/competitions/XX/matches").status_code == 404
    assert api.get("/api/competitions/SA/matches?matchday=0").status_code == 422
    assert api.get("/api/competitions/SA/matches?matchday=abc").status_code == 422


def test_standings_shape(api):
    body = api.get("/api/competitions/PL/standings").json()
    assert body["season"]["label"] == "2021-22"
    assert body["stale"] is False
    row = body["table"][0]
    assert row == {
        "position": 1,
        "team": {"id": 65, "name": "Manchester City FC", "shortName": "Man City",
                 "crest": "https://crests.football-data.org/65.png"},
        "played": 37, "won": 28, "draw": 6, "lost": 3,
        "goalsFor": 96, "goalsAgainst": 24, "goalDifference": 72, "points": 90,
        "form": "D,W,W,W,W",
    }
    assert len(body["table"]) == 3  # the TOTAL table, not the empty HOME one
    assert body["zones"]["relegation"] == {"label": "Relegation", "from": 18, "to": 20}


def test_every_competition_has_zones(api):
    from football.competitions import CODES, ZONES

    assert set(ZONES) == set(CODES)


def test_team_shape(api):
    body = api.get("/api/teams/65").json()
    assert body["team"] == {
        "id": 65, "name": "Manchester City FC", "shortName": "Man City",
        "crest": "https://crests.football-data.org/65.png",
        "venue": "Etihad Stadium", "founded": 1880,
    }
    assert body["nextMatch"]["id"] == 2100
    recent = body["recentMatches"]
    assert [m["id"] for m in recent] == [2007, 2006, 2005, 2004, 2003]  # newest first
    assert [m["result"] for m in recent] == ["L", "D", "W", "L", "L"]
    assert body["positions"] == [{"competition": "PL", "position": 1, "points": 90}]
    # City also play in the Champions League; that table is not fetched cold, so the page
    # says it is partial (stale) rather than spending a third upstream call.
    assert body["stale"] is True
    assert "squad" not in body and "squad" not in body["team"]


def test_team_id_must_be_a_number(api):
    assert api.get("/api/teams/abc").status_code == 422
