"""Turn football-data.org v4 payloads into the small JSON shapes the front end uses.

Everything not named here (lineups, coaches, squads, referees, odds) is dropped.
"""
from .competitions import ZONES


def team_ref(t):
    t = t or {}
    return {
        "id": t.get("id"),
        "name": t.get("name"),
        "shortName": t.get("shortName") or t.get("name"),
        "crest": t.get("crest"),
    }


def competition_ref(c):
    c = c or {}
    return {"code": c.get("code"), "name": c.get("name"), "emblem": c.get("emblem")}


def match(m):
    full = (m.get("score") or {}).get("fullTime") or {}
    out = {
        "id": m.get("id"),
        "competition": competition_ref(m.get("competition")),
        "utcDate": m.get("utcDate"),
        "status": m.get("status"),
        "homeTeam": team_ref(m.get("homeTeam")),
        "awayTeam": team_ref(m.get("awayTeam")),
        "score": {"home": full.get("home"), "away": full.get("away")},
    }
    minute = m.get("minute")
    if minute is not None and m.get("status") in ("IN_PLAY", "PAUSED"):
        out["minute"] = int(minute) if str(minute).isdigit() else minute
    return out


def standings(payload, code):
    season = payload.get("season") or {}
    groups = payload.get("standings") or []
    total = next((g for g in groups if g.get("type") == "TOTAL"), groups[0] if groups else {})
    table = [
        {
            "position": row.get("position"),
            "team": team_ref(row.get("team")),
            "played": row.get("playedGames"),
            "won": row.get("won"),
            "draw": row.get("draw"),
            "lost": row.get("lost"),
            "goalsFor": row.get("goalsFor"),
            "goalsAgainst": row.get("goalsAgainst"),
            "goalDifference": row.get("goalDifference"),
            "points": row.get("points"),
            "form": row.get("form"),
        }
        for row in total.get("table") or []
    ]
    start, end = season.get("startDate") or "", season.get("endDate") or ""
    label = "%s-%s" % (start[:4], end[2:4]) if start and end else None
    return {
        "season": {
            "label": label,
            "startDate": season.get("startDate"),
            "endDate": season.get("endDate"),
            "currentMatchday": season.get("currentMatchday"),
        },
        "table": table,
        "zones": ZONES.get(code, {}),
    }


def result_for(team_id, m):
    """W/D/L from one team's point of view, or None if the match has no final score."""
    full = (m.get("score") or {}).get("fullTime") or {}
    home, away = full.get("home"), full.get("away")
    if m.get("status") != "FINISHED" or home is None or away is None:
        return None
    if home == away:
        return "D"
    is_home = (m.get("homeTeam") or {}).get("id") == team_id
    return "W" if (home > away) == is_home else "L"
