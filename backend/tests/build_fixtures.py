"""Regenerates tests/fixtures/*.json: abbreviated v4 payloads modelled on the examples at
https://www.football-data.org/documentation/quickstart and the overtime/penalty example at
https://docs.football-data.org/general/v4/policies.html (same fields, a few extra ones the
API sends and we must drop, such as lineups, coaches and squads). No network, no key.

    python tests/build_fixtures.py
"""
import json
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")


def team(i, n, s, t, extra=True):
    d = {"id": i, "name": n, "shortName": s, "tla": t, "crest": f"https://crests.football-data.org/{i}.png"}
    if extra:
        d.update({"coach": {"id": 1, "name": "Some Coach", "nationality": "Italy"}, "leagueRank": 3,
                  "formation": "4-2-3-1", "lineup": [], "bench": []})
    return d


def comp(id, n, c):
    return {"id": id, "name": n, "code": c, "type": "LEAGUE", "emblem": f"https://crests.football-data.org/{c}.png"}


def regular(fh, fa):
    return {"winner": None, "duration": "REGULAR", "fullTime": {"home": fh, "away": fa},
            "halfTime": {"home": 0, "away": 1}}


def overtime(duration, full, regular_time, extra_time=None, pens=None):
    """Shaped exactly like the policies page example: homeTeam/awayTeam keys, regularTime,
    extraTime and penalties nodes. fullTime includes extra time and the shootout."""
    def p(t):
        return {"homeTeam": t[0], "awayTeam": t[1]}
    s = {"winner": "HOME_TEAM", "duration": duration, "fullTime": p(full), "halfTime": {"homeTeam": 1, "awayTeam": 1},
         "regularTime": p(regular_time)}
    if extra_time is not None:
        s["extraTime"] = p(extra_time)
    if pens is not None:
        s["penalties"] = p(pens)
    return s


def match(id, c, date, status, h, a, fh=None, fa=None, minute=None, md=34, injury=None, score=None):
    d = {"area": {"id": 1, "name": "x", "code": "X", "flag": None}, "competition": c,
         "season": {"id": 742, "startDate": "2021-08-13", "endDate": "2022-05-14", "currentMatchday": 34, "winner": None},
         "id": id, "utcDate": date, "status": status, "venue": "Stadium", "matchday": md,
         "stage": "REGULAR_SEASON", "group": None, "lastUpdated": date, "homeTeam": h, "awayTeam": a,
         "score": score or regular(fh, fa),
         "goals": [], "referees": [{"id": 9, "name": "Ref"}]}
    if minute is not None:
        d["minute"] = minute
        d["injuryTime"] = injury
    return d


def write(name, obj):
    with open(os.path.join(OUT, name), "w") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")


BL, SA, PL = comp(2002, "Bundesliga", "BL1"), comp(2019, "Serie A", "SA"), comp(2021, "Premier League", "PL")
CL, PD = comp(2001, "UEFA Champions League", "CL"), comp(2014, "Primera Division", "PD")
dort, hert = team(4, "Borussia Dortmund", "Dortmund", "BVB"), team(9, "Hertha BSC", "Hertha BSC", "BSC")
juve, mil = team(109, "Juventus FC", "Juventus", "JUV"), team(98, "AC Milan", "Milan", "MIL")
inter, rom = team(108, "FC Internazionale Milano", "Inter", "INT"), team(100, "AS Roma", "Roma", "ROM")
mcity = team(65, "Manchester City FC", "Man City", "MCI")
rmad, barca = team(86, "Real Madrid CF", "Real Madrid", "RMA"), team(81, "FC Barcelona", "Barca", "FCB")


def comp_detail(c, matchday):
    return {"id": c["id"], "area": {"id": 1, "name": "x", "code": "X", "flag": None}, "name": c["name"], "code": c["code"],
            "type": "LEAGUE", "emblem": c["emblem"],
            "currentSeason": {"id": 999, "startDate": "2021-08-21", "endDate": "2022-05-22",
                              "currentMatchday": matchday, "winner": None},
            "seasons": [], "lastUpdated": "2022-03-20T08:58:54Z"}


write("competition_SA.json", comp_detail(SA, 34))
write("competition_CL.json", comp_detail(CL, 8))
write("competition_PD.json", comp_detail(PD, None))  # off-season style: no current matchday

write("matches_SA_md34.json", {
    "filters": {"season": "2021", "matchday": "34"}, "resultSet": {"count": 2}, "competition": SA,
    "matches": [match(1001, SA, "2022-05-14T18:45:00Z", "FINISHED", juve, mil, 2, 1, 90),
                match(1002, SA, "2022-05-14T18:45:00Z", "TIMED", inter, rom)]})
write("matches_SA_md30.json", {
    "filters": {"season": "2021", "matchday": "30"}, "resultSet": {"count": 1}, "competition": SA,
    "matches": [match(900, SA, "2022-04-10T18:45:00Z", "FINISHED", rom, inter, 0, 0, 90, 30)]})

# Whole season, no matchday filter: matchdays 1 and 2 played, 3 not yet.
write("matches_PD_all.json", {
    "filters": {"season": "2021"}, "resultSet": {"count": 3}, "competition": PD,
    "matches": [match(3001, PD, "2022-01-01T20:00:00Z", "FINISHED", rmad, barca, 1, 0, 90, 1),
                match(3002, PD, "2022-01-08T20:00:00Z", "FINISHED", barca, rmad, 2, 2, 90, 2),
                match(3003, PD, "2022-01-15T20:00:00Z", "TIMED", rmad, barca, md=3)]})

# Cup nights: regular finish, extra time, shootout (docs example), and live overtime.
write("matches_CL_md8.json", {
    "filters": {"season": "2021", "matchday": "8"}, "resultSet": {"count": 6}, "competition": CL,
    "matches": [
        match(4001, CL, "2022-05-14T19:00:00Z", "FINISHED", dort, hert, 2, 1, 90, 8),
        match(4002, CL, "2022-05-14T19:00:00Z", "FINISHED", juve, mil, md=8, minute=120,
              score=overtime("EXTRA_TIME", (2, 1), (1, 1), (1, 0))),
        match(4003, CL, "2022-05-14T19:00:00Z", "FINISHED", rmad, barca, md=8, minute=120,
              score=overtime("PENALTY_SHOOTOUT", (7, 6), (1, 1), (0, 0), (6, 5))),
        match(4004, CL, "2022-05-14T19:00:00Z", "EXTRA_TIME", inter, rom, md=8, minute=105, injury=None,
              score=overtime("EXTRA_TIME", (1, 1), (1, 1), (0, 0))),
        match(4005, CL, "2022-05-14T19:00:00Z", "PENALTY_SHOOTOUT", mcity, team(57, "Arsenal FC", "Arsenal", "ARS"),
              md=8, minute=120, injury=2, score=overtime("PENALTY_SHOOTOUT", (4, 3), (1, 1), (0, 0), (3, 2))),
        match(4006, CL, "2022-05-14T19:00:00Z", "SUSPENDED", team(64, "Liverpool FC", "Liverpool", "LIV"),
              team(61, "Chelsea FC", "Chelsea", "CHE"), 0, 0, 34, md=8)]})

write("matches_today.json", {
    "filters": {"dateFrom": "2022-05-14", "dateTo": "2022-05-15"}, "resultSet": {"count": 4, "competitions": "BL1,SA,PL"},
    "matches": [
        match(329400, BL, "2022-05-14T13:30:00Z", "FINISHED", dort, hert, 2, 1, 90, injury=5),
        match(1003, SA, "2022-05-14T18:45:00Z", "IN_PLAY", juve, mil, 1, 1, 67),
        match(1004, PL, "2022-05-14T19:00:00Z", "TIMED", mcity, team(57, "Arsenal FC", "Arsenal", "ARS")),
        match(1005, PL, "2022-05-15T14:00:00Z", "TIMED", team(64, "Liverpool FC", "Liverpool", "LIV"),
              team(61, "Chelsea FC", "Chelsea", "CHE"))]})

rows = [("Manchester City FC", "Man City", "MCI", 65, 37, "D,W,W,W,W", 28, 6, 3, 90, 96, 24),
        ("Liverpool FC", "Liverpool", "LIV", 64, 36, "W,D,W,W,W", 26, 8, 2, 86, 89, 24),
        ("Chelsea FC", "Chelsea", "CHE", 61, 36, "W,D,L,D,W", 20, 10, 6, 70, 73, 31)]
table = [{"position": i + 1,
          "team": {"id": r[3], "name": r[0], "shortName": r[1], "tla": r[2], "crest": f"https://crests.football-data.org/{r[3]}.png"},
          "playedGames": r[4], "form": r[5], "won": r[6], "draw": r[7], "lost": r[8], "points": r[9],
          "goalsFor": r[10], "goalsAgainst": r[11], "goalDifference": r[10] - r[11]} for i, r in enumerate(rows)]
write("standings_PL.json", {
    "filters": {"season": "2021"}, "area": {"id": 2072, "name": "England", "code": "ENG", "flag": None}, "competition": PL,
    "season": {"id": 733, "startDate": "2021-08-13", "endDate": "2022-05-22", "currentMatchday": 37, "winner": None,
               "stages": ["REGULAR_SEASON"]},
    "standings": [{"stage": "REGULAR_SEASON", "type": "HOME", "group": None, "table": []},
                  {"stage": "REGULAR_SEASON", "type": "TOTAL", "group": None, "table": table}]})


def full_team(i, n, s, t, venue, founded, codes):
    """A team as /competitions/{code}/teams lists it: venue, founded, runningCompetitions, a squad."""
    d = team(i, n, s, t, False)
    d.update({"address": "x", "website": "http://example.org", "founded": founded, "clubColors": "Blue / White",
              "venue": venue, "runningCompetitions": [comp(0, c, c) for c in codes],
              "coach": {"id": 1, "name": "Pep"}, "marketValue": 1,
              "squad": [{"id": 11656, "name": "A Player", "position": "Goalkeeper"}]})
    return d


write("teams_PL.json", {
    "count": 3, "competition": PL, "season": {"id": 733, "startDate": "2021-08-13", "endDate": "2022-05-22"},
    "teams": [full_team(65, "Manchester City FC", "Man City", "MCI", "Etihad Stadium", 1880, ["PL", "CL"]),
              full_team(64, "Liverpool FC", "Liverpool", "LIV", "Anfield", 1892, ["PL", "CL"]),
              full_team(61, "Chelsea FC", "Chelsea", "CHE", "Stamford Bridge", 1905, ["PL", "CL"])]})
write("teams_CL.json", {
    "count": 2, "competition": CL, "season": {"id": 1, "startDate": "2021-08-13", "endDate": "2022-05-22"},
    "teams": [full_team(65, "Manchester City FC", "Man City", "MCI", "Etihad Stadium", 1880, ["PL", "CL"]),
              full_team(109, "Juventus FC", "Juventus", "JUV", "Allianz Stadium", 1897, ["SA", "CL"])]})
write("teams_SA.json", {
    "count": 2, "competition": SA, "season": {"id": 1, "startDate": "2021-08-13", "endDate": "2022-05-22"},
    "teams": [full_team(109, "Juventus FC", "Juventus", "JUV", "Allianz Stadium", 1897, ["SA", "CL"]),
              full_team(98, "AC Milan", "Milan", "MIL", "San Siro", 1899, ["SA"])]})


def opp(i):
    return team(i, f"Club {i}", f"C{i}", f"C{i % 10}", False)


# Seven finished matches (City at home when i is odd), then two still to play.
scores = [(3, 0), (1, 1), (0, 2), (2, 1), (1, 0), (2, 2), (0, 1)]
tm = []
for i, (h, a) in zip(range(1, 8), scores):
    home, away = (mcity, opp(i)) if i % 2 else (opp(i), mcity)
    tm.append(match(2000 + i, PL, f"2022-0{i}-1{i}T15:00:00Z", "FINISHED", home, away, h, a, 90, i))
tm.append(match(2100, PL, "2022-05-22T15:00:00Z", "SCHEDULED", mcity, opp(90)))
tm.append(match(2101, PL, "2022-05-29T15:00:00Z", "TIMED", opp(91), mcity))
write("team_65_matches.json", {"filters": {"limit": 100}, "resultSet": {"count": len(tm)}, "matches": tm})
