"""Turn football-data.org v4 payloads into the small JSON shapes the front end uses.

Everything not named here (lineups, coaches, squads, referees, odds) is dropped.
"""
from .competitions import ZONES

# Statuses in which a match is under way (or stopped mid-way) and may carry a minute.
LIVE_STATUSES = ("IN_PLAY", "PAUSED", "EXTRA_TIME", "PENALTY_SHOOTOUT", "SUSPENDED")
# A team's "next match": anything not yet finished and not called off.
UPCOMING_STATUSES = ("SCHEDULED", "TIMED") + LIVE_STATUSES


# --- vetting upstream bodies before they are cached --------------------------------------

def _dicts(items):
    return isinstance(items, list) and all(isinstance(i, dict) for i in items)


def ok_matches(body):
    return isinstance(body, dict) and _dicts(body.get("matches"))


def ok_competition(body):
    return isinstance(body, dict) and isinstance(body.get("currentSeason", {}), (dict, type(None)))


def ok_standings(body):
    if not isinstance(body, dict) or not isinstance(body.get("season"), dict):
        return False
    groups = body.get("standings")
    return _dicts(groups) and all(_dicts(g.get("table")) for g in groups)


def ok_teams(body):
    return isinstance(body, dict) and _dicts(body.get("teams")) and all(
        isinstance(t.get("id"), int) for t in body["teams"]
    )


# --- shaping ------------------------------------------------------------------------------

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


def _pair(node):
    """(home, away) from a score node. v4 sends home/away; the overtime docs say homeTeam/awayTeam."""
    if not isinstance(node, dict):
        return None
    home = node["home"] if "home" in node else node.get("homeTeam")
    away = node["away"] if "away" in node else node.get("awayTeam")
    return home, away


def _has(pair):
    return pair is not None and isinstance(pair[0], int) and isinstance(pair[1], int)


def score(m):
    """The result as football counts it: 90 minutes plus extra time, shootout kept apart.

    fullTime includes the shootout goals (a 1-1 game won 6-5 on penalties has fullTime 7-6),
    so for extra-time and shootout matches the result is regularTime + extraTime, or fullTime
    minus penalties when regularTime is missing.
    """
    sc = m.get("score") or {}
    duration = sc.get("duration") or "REGULAR"
    full, regular = _pair(sc.get("fullTime")), _pair(sc.get("regularTime"))
    extra, pens = _pair(sc.get("extraTime")), _pair(sc.get("penalties"))
    home = away = None
    if duration != "REGULAR" and _has(regular):
        et = extra if _has(extra) else (0, 0)
        home, away = regular[0] + et[0], regular[1] + et[1]
    elif duration == "PENALTY_SHOOTOUT" and _has(full) and _has(pens):
        home, away = full[0] - pens[0], full[1] - pens[1]
    elif full is not None:
        home, away = full
    out = {"home": home, "away": away, "duration": duration}
    if duration == "PENALTY_SHOOTOUT" and _has(pens):
        out["penalties"] = {"home": pens[0], "away": pens[1]}
    return out


def _int(value):
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def match(m):
    out = {
        "id": m.get("id"),
        "competition": competition_ref(m.get("competition")),
        "utcDate": m.get("utcDate"),
        "status": m.get("status"),
        "homeTeam": team_ref(m.get("homeTeam")),
        "awayTeam": team_ref(m.get("awayTeam")),
        "score": score(m),
    }
    if m.get("status") in LIVE_STATUSES:
        minute, injury = _int(m.get("minute")), _int(m.get("injuryTime"))
        if minute is not None:
            out["minute"] = minute
        if injury is not None:
            out["injuryTime"] = injury
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
    """W/D/L from one team's point of view, or None if the match has no final score.

    A shootout is a draw here: the score after extra time is level.
    """
    s = score(m)
    home, away = s["home"], s["away"]
    if m.get("status") != "FINISHED" or home is None or away is None:
        return None
    if home == away:
        return "D"
    is_home = (m.get("homeTeam") or {}).get("id") == team_id
    return "W" if (home > away) == is_home else "L"
