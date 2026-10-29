#!/usr/bin/env python3
"""football-scores data layer in plain Python (standard library only).

The same logic as src/data/helpers.ts and goose/footy.goose, printing the same bytes:
  footy.py standings < raw/standings.json   StandingRow[] -> StandingRow[]  (points, sorted, positions)
  footy.py results   < raw/results.json     MatchEvent[]  -> [{round, events:[MatchEvent + outcome]}]
Name order is the documented collation rule (data/collation.json, from scripts/gen-collation.mjs):
weights per character, compared as primary, then secondary, then tertiary. Names must be NFC.
"""
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))


def _load_table():
    with open(os.path.join(_HERE, "..", "data", "collation.json"), encoding="utf-8") as f:
        t = json.load(f)
    return t["from"], t["to"], t["weights"]


_FROM, _TO, _WEIGHTS = _load_table()


def name_key(name):
    """Sort key for a name: (primaries, secondaries, tertiaries); lists compare element by element, shorter first."""
    p, s, t = [], [], []
    for ch in name:
        cp = ord(ch)
        w = _WEIGHTS[cp - _FROM] if _FROM <= cp <= _TO else (0, 0, 0)
        if w[0] == 0:  # outside the table: code point order after every table character
            p.append(0x10000 + cp)
            s.append(0)
            t.append(0)
        else:
            p.append(w[0])
            s.append(w[1])
            t.append(w[2])
    return (p, s, t)


def _dump(value):
    # compact, key order as built, non-ASCII kept as is: the same bytes as JS JSON.stringify
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def standings(rows):
    out = []
    for r in rows:
        points = r["wins"] * 3 + r["draws"]
        out.append((r, points))
    # Python's sort is stable, like Array.prototype.sort: equal rows keep input order.
    out.sort(key=lambda rp: (-rp[1], -rp[0]["wins"], name_key(rp[0]["team"]["name"])))
    return [
        {
            "id": r["id"],
            "position": i + 1,
            "team": {"id": r["team"]["id"], "name": r["team"]["name"]},
            "matches": r["matches"],
            "wins": r["wins"],
            "draws": r["draws"],
            "losses": r["losses"],
            "points": points,
        }
        for i, (r, points) in enumerate(out)
    ]


def outcome(home, away):
    return "home" if home > away else "away" if home < away else "draw"


def results(events):
    ordered = sorted(events, key=lambda e: -e["roundInfo"]["round"])  # stable, newest round first
    rounds = []
    for e in ordered:
        rnd = e["roundInfo"]["round"]
        if not rounds or rounds[-1]["round"] != rnd:
            rounds.append({"round": rnd, "events": []})
        h, a = e["homeScore"]["current"], e["awayScore"]["current"]
        rounds[-1]["events"].append(
            {
                "id": e["id"],
                "homeScore": {"current": h},
                "homeTeam": {"id": e["homeTeam"]["id"], "name": e["homeTeam"]["name"]},
                "awayScore": {"current": a},
                "awayTeam": {"id": e["awayTeam"]["id"], "name": e["awayTeam"]["name"]},
                "status": {"type": e["status"]["type"]},
                "roundInfo": {"round": rnd},
                "outcome": outcome(h, a),
            }
        )
    return rounds


def run(kind, text):
    data = json.loads(text)
    return _dump(results(data) if kind == "results" else standings(data)) + "\n"


def main(argv):
    kind = argv[1] if len(argv) > 1 else "standings"
    if kind not in ("standings", "results"):
        sys.stderr.write("usage: footy.py standings|results < raw.json\n")
        return 2
    text = sys.stdin.buffer.read().decode("utf-8")
    try:
        out = run(kind, text)
    except (ValueError, KeyError, TypeError) as e:
        sys.stderr.write("footy: bad input: %r\n" % (e,))
        return 1
    sys.stdout.buffer.write(out.encode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
