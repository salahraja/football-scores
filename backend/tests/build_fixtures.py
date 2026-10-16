"""Regenerates tests/fixtures/*.json: abbreviated v4 payloads modelled on the examples at
https://www.football-data.org/documentation/quickstart (same fields, a few extra ones the
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


def match(id, c, date, status, h, a, fh, fa, minute=None, md=34):
    d = {"area": {"id": 1, "name": "x", "code": "X", "flag": None}, "competition": c,
         "season": {"id": 742, "startDate": "2021-08-13", "endDate": "2022-05-14", "currentMatchday": 34, "winner": None},
         "id": id, "utcDate": date, "status": status, "venue": "Stadium", "matchday": md,
         "stage": "REGULAR_SEASON", "group": None, "lastUpdated": date, "homeTeam": h, "awayTeam": a,
         "score": {"winner": None, "duration": "REGULAR", "fullTime": {"home": fh, "away": fa},
                   "halfTime": {"home": 0, "away": 1}},
         "goals": [], "referees": [{"id": 9, "name": "Ref"}]}
    if minute:
        d["minute"] = minute
        d["injuryTime"] = None
    return d


def write(name, obj):
    with open(os.path.join(OUT, name), "w") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")


BL, SA, PL = comp(2002, "Bundesliga", "BL1"), comp(2019, "Serie A", "SA"), comp(2021, "Premier League", "PL")
dort, hert = team(4, "Borussia Dortmund", "Dortmund", "BVB"), team(9, "Hertha BSC", "Hertha BSC", "BSC")
juve, mil = team(109, "Juventus FC", "Juventus", "JUV"), team(98, "AC Milan", "Milan", "MIL")
inter, rom = team(108, "FC Internazionale Milano", "Inter", "INT"), team(100, "AS Roma", "Roma", "ROM")

write("competition_SA.json", {
    "id": 2019, "area": {"id": 2114, "name": "Italy", "code": "ITA", "flag": None}, "name": "Serie A", "code": "SA",
    "type": "LEAGUE", "emblem": "https://crests.football-data.org/SA.png",
    "currentSeason": {"id": 999, "startDate": "2021-08-21", "endDate": "2022-05-22", "currentMatchday": 34, "winner": None},
    "seasons": [], "lastUpdated": "2022-03-20T08:58:54Z"})
write("matches_SA_md34.json", {
    "filters": {"season": "2021", "matchday": "34"}, "resultSet": {"count": 2}, "competition": SA,
    "matches": [match(1001, SA, "2022-05-14T18:45:00Z", "FINISHED", juve, mil, 2, 1, "90"),
                match(1002, SA, "2022-05-14T18:45:00Z", "TIMED", inter, rom, None, None)]})
write("matches_SA_md30.json", {
    "filters": {"season": "2021", "matchday": "30"}, "resultSet": {"count": 1}, "competition": SA,
    "matches": [match(900, SA, "2022-04-10T18:45:00Z", "FINISHED", rom, inter, 0, 0, "90", 30)]})
write("matches_today.json", {
    "filters": {"dateFrom": "2022-05-14", "dateTo": "2022-05-15"}, "resultSet": {"count": 4, "competitions": "BL1,SA,PL"},
    "matches": [
        match(329400, BL, "2022-05-14T13:30:00Z", "FINISHED", dort, hert, 2, 1, "90"),
        match(1003, SA, "2022-05-14T18:45:00Z", "IN_PLAY", juve, mil, 1, 1, "67"),
        match(1004, PL, "2022-05-14T19:00:00Z", "TIMED", team(65, "Manchester City FC", "Man City", "MCI"),
              team(57, "Arsenal FC", "Arsenal", "ARS"), None, None),
        match(1005, PL, "2022-05-15T14:00:00Z", "TIMED", team(64, "Liverpool FC", "Liverpool", "LIV"),
              team(61, "Chelsea FC", "Chelsea", "CHE"), None, None)]})

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

write("team_65.json", {
    "area": {"id": 2072, "name": "England", "code": "ENG", "flag": None}, "id": 65, "name": "Manchester City FC",
    "shortName": "Man City", "tla": "MCI", "crest": "https://crests.football-data.org/65.png", "address": "x",
    "website": "http://www.mancity.com", "founded": 1880, "clubColors": "Sky Blue / White", "venue": "Etihad Stadium",
    "runningCompetitions": [PL | {"type": "LEAGUE"},
                            {"id": 2146, "name": "Some Cup", "code": "XYZ", "type": "CUP", "emblem": None}],
    "coach": {"id": 1, "name": "Pep"}, "marketValue": 1,
    "squad": [{"id": 11656, "name": "A Player", "position": "Goalkeeper"}]})

mc = team(65, "Manchester City FC", "Man City", "MCI", False)


def opp(i):
    return team(i, f"Club {i}", f"C{i}", f"C{i % 10}", False)


# Seven finished matches (City at home when i is odd), then two still to play.
scores = [(3, 0), (1, 1), (0, 2), (2, 1), (1, 0), (2, 2), (0, 1)]
tm = []
for i, (h, a) in zip(range(1, 8), scores):
    home, away = (mc, opp(i)) if i % 2 else (opp(i), mc)
    tm.append(match(2000 + i, PL, f"2022-0{i}-1{i}T15:00:00Z", "FINISHED", home, away, h, a, "90", i))
tm.append(match(2100, PL, "2022-05-22T15:00:00Z", "SCHEDULED", mc, opp(90), None, None))
tm.append(match(2101, PL, "2022-05-29T15:00:00Z", "TIMED", opp(91), mc, None, None))
write("team_65_matches.json", {"filters": {"limit": 100}, "resultSet": {"count": len(tm)}, "matches": tm})
