"""The six competitions the app serves, and their qualification/relegation zones for 2026-27.

Zones are a small constant table, not API data (football-data.org does not give them).
`from` and `to` are inclusive table positions.

Source: the UEFA Champions League 2026-27 access list (UEFA regulations, as summarised at
https://en.wikipedia.org/wiki/2026%E2%80%9327_UEFA_Champions_League, updated 14 Oct 2026):
the two associations with the best 2025-26 coefficients, England and Spain, get a fifth
league-phase place (a European Performance Spot, EPS). France's fourth place is treated as
a league-path qualifying place (taken from the review of this table, not from that page).
The Europa/Conference rows are the usual layout, not sourced. EPS goes to different associations
from year to year, and the Europa/Conference positions below move with it and with
domestic cup winners, so re-check this table every summer.
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
# Order in which team lists are searched when looking a team up: the default league first.
TEAM_SEARCH_ORDER = ["SA", "PL", "PD", "BL1", "FL1", "CL"]


# The `stage` values football-data.org v4 puts on matches, in the order a season plays them.
# LEAGUE_STAGE is what the Champions League uses since 2024-25; the rest are the documented enum.
STAGES = [
    "PRELIMINARY_ROUND", "QUALIFICATION", "QUALIFICATION_ROUND_1", "QUALIFICATION_ROUND_2",
    "QUALIFICATION_ROUND_3", "PLAYOFF_ROUND_1", "PLAYOFF_ROUND_2",
    "REGULAR_SEASON", "GROUP_STAGE", "LEAGUE_STAGE", "ROUND_1", "ROUND_2", "ROUND_3", "ROUND_4",
    "PLAYOFFS", "LAST_64", "LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL",
]
# Competitions whose season has rounds beyond the numbered matchdays.
STAGED = ["CL"]


def _zone(label, first, last):
    return {"label": label, "from": first, "to": last}


ZONES = {
    "PL": {
        "championsLeague": _zone("Champions League", 1, 5),
        "europaLeague": _zone("Europa League", 6, 6),
        "conferenceLeague": _zone("Conference League", 7, 7),
        "relegation": _zone("Relegation", 18, 20),
    },
    "PD": {
        "championsLeague": _zone("Champions League", 1, 5),
        "europaLeague": _zone("Europa League", 6, 7),
        "conferenceLeague": _zone("Conference League", 8, 8),
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
        "championsLeagueQualifying": _zone("Champions League qualifying (league path)", 4, 4),
        "europaLeague": _zone("Europa League", 5, 5),
        "conferenceLeague": _zone("Conference League", 6, 6),
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
