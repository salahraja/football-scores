"""Runs only when TEST_DATABASE_URL points at a throwaway Postgres database."""
import os

import pytest

from football.cache import Cache

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_DATABASE_URL not set")


def test_round_trip_survives_a_new_process_and_keeps_the_newest():
    a = Cache(URL)  # creates the table
    a.put("k", 100.0, {"n": 1})
    b = Cache(URL)  # a fresh process: empty memory, same database
    assert b.get("k") == (100.0, {"n": 1})
    b.put("k", 200.0, {"n": 2})
    assert a.get("k") == (200.0, {"n": 2})  # a's older memory copy loses to the database


def test_unreachable_database_falls_back_to_memory():
    c = Cache("postgresql://nobody@127.0.0.1:1/none")
    c.put("k", 1.0, {"ok": True})
    assert c.get("k") == (1.0, {"ok": True})
