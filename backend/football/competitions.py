"""The six competitions the app serves, and their qualification/relegation zones.

Zones are a small constant table, not API data (football-data.org does not give them).
They follow the usual European-place layout and change a little each season with UEFA
rules, so treat them as the common case: `from` and `to` are inclusive table positions.
"""

CREST_URL = "https://crests.football-data.org/{code}.png"

# Order here is the order of GET /api/competitions.
COMPETITIONS = [
    {"code": "PL", "name": "Premier League", "country": "England"},
    {"code": "PD", "name": "La Liga", "country": "Spain"},
    {"code": "BL1", "name": "Bundesliga", "country": "Germany"},
    {"code": "SA", "name": "Serie A", "country": "Italy"},
    {"code": "FL1", "name": "Ligue 1", "country": "France"},
    {"code": "CL", "name": "UEFA Champions League", "country": "Europe"},
]
for _c in COMPETITIONS:
    _c["emblem"] = CREST_URL.format(code=_c["code"])

CODES = [c["code"] for c in COMPETITIONS]
DEFAULT_CODE = "SA"


def _zone(label, first, last):
    return {"label": label, "from": first, "to": last}


ZONES = {
    "PL": {
        "championsLeague": _zone("Champions League", 1, 4),
        "europaLeague": _zone("Europa League", 5, 5),
        "relegation": _zone("Relegation", 18, 20),
    },
    "PD": {
        "championsLeague": _zone("Champions League", 1, 4),
        "europaLeague": _zone("Europa League", 5, 6),
        "conferenceLeague": _zone("Conference League", 7, 7),
        "relegation": _zone("Relegation", 18, 20),
    },
    "BL1": {
        "championsLeague": _zone("Champions League", 1, 4),
        "europaLeague": _zone("Europa League", 5, 5),
        "conferenceLeague": _zone("Conference League", 6, 6),
        "relegationPlayoff": _zone("Relegation play-off", 16, 16),
        "relegation": _zone("Relegation", 17, 18),
    },
    "SA": {
        "championsLeague": _zone("Champions League", 1, 4),
        "europaLeague": _zone("Europa League", 5, 5),
        "conferenceLeague": _zone("Conference League", 6, 6),
        "relegation": _zone("Relegation", 18, 20),
    },
    "FL1": {
        "championsLeague": _zone("Champions League", 1, 3),
        "europaLeague": _zone("Europa League", 4, 4),
        "conferenceLeague": _zone("Conference League", 5, 5),
        "relegationPlayoff": _zone("Relegation play-off", 16, 16),
        "relegation": _zone("Relegation", 17, 18),
    },
    # League phase of 36 teams.
    "CL": {
        "roundOf16": _zone("Round of 16", 1, 8),
        "playoff": _zone("Knockout play-off", 9, 24),
        "eliminated": _zone("Eliminated", 25, 36),
    },
}
