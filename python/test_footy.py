"""Tests for python/footy.py. Standard library only: python3 -m unittest discover -s python
The golden files in tests/golden are the TS reference output (scripts/make-golden.mjs); the Python output must match them byte for byte."""
import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, HERE)
import footy  # noqa: E402


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return f.read()


class Golden(unittest.TestCase):
    def test_every_fixture_matches_the_ts_reference(self):
        names = sorted(f for f in os.listdir(os.path.join(ROOT, "tests", "golden")) if f.endswith(".json"))
        self.assertGreaterEqual(len(names), 14)
        for f in names:
            kind = "results" if f.endswith(".results.json") else "standings"
            with self.subTest(fixture=f):
                self.assertEqual(footy.run(kind, read("tests/fixtures/" + f)), read("tests/golden/" + f))

    def test_cli_prints_the_same_bytes_as_run(self):
        text = read("tests/fixtures/sample.standings.json")
        out = subprocess.run([sys.executable, "-I", os.path.join(HERE, "footy.py"), "standings"], input=text.encode(), capture_output=True, check=True).stdout
        self.assertEqual(out.decode("utf-8"), footy.run("standings", text))


class Logic(unittest.TestCase):
    def row(self, i, name, w, d):
        return {"id": i, "position": 0, "team": {"id": i, "name": name}, "matches": 10, "wins": w, "draws": d, "losses": 10 - w - d, "points": 0}

    def test_points_wins_then_name(self):
        t = footy.standings([self.row(1, "B", 4, 3), self.row(2, "A", 4, 3), self.row(3, "C", 5, 0)])
        self.assertEqual([r["team"]["name"] for r in t], ["C", "A", "B"])
        self.assertEqual([r["position"] for r in t], [1, 2, 3])
        self.assertEqual([r["points"] for r in t], [15, 15, 15])

    def test_does_not_mutate_input(self):
        rows = [self.row(1, "B", 1, 0), self.row(2, "A", 2, 0)]
        before = repr(rows)
        footy.standings(rows)
        self.assertEqual(repr(rows), before)

    def test_accents_and_case_follow_icu(self):
        names = ["zeta", "Alpha", "Émile", "émile", "Emile", "ÉMILE"]
        t = footy.standings([self.row(i, n, 1, 0) for i, n in enumerate(names)])
        self.assertEqual([r["team"]["name"] for r in t], ["Alpha", "Emile", "émile", "Émile", "ÉMILE", "zeta"])

    def test_equal_rows_keep_input_order(self):
        t = footy.standings([self.row(5, "Same", 1, 1), self.row(3, "Same", 1, 1)])
        self.assertEqual([r["id"] for r in t], [5, 3])

    def test_outcome(self):
        self.assertEqual([footy.outcome(2, 1), footy.outcome(0, 3), footy.outcome(1, 1)], ["home", "away", "draw"])

    def test_rounds_newest_first_input_order_inside(self):
        def ev(i, rnd):
            return {"id": i, "homeScore": {"current": 1}, "homeTeam": {"id": 1, "name": "a"}, "awayScore": {"current": 0},
                    "awayTeam": {"id": 2, "name": "b"}, "status": {"type": "finished"}, "roundInfo": {"round": rnd}}
        r = footy.results([ev(1, 3), ev(2, 5), ev(3, 5)])
        self.assertEqual([x["round"] for x in r], [5, 3])
        self.assertEqual([e["id"] for e in r[0]["events"]], [2, 3])

    def test_empty(self):
        self.assertEqual(footy.run("standings", "[]"), "[]\n")
        self.assertEqual(footy.run("results", "[]"), "[]\n")

    def test_bad_input_exits_nonzero(self):
        p = subprocess.run([sys.executable, "-I", os.path.join(HERE, "footy.py"), "standings"], input=b"{nope", capture_output=True)
        self.assertEqual(p.returncode, 1)


if __name__ == "__main__":
    unittest.main()
