"""Response cache: in memory always, plus Postgres when DATABASE_URL is set.

Entries are (fetched_at, body) where fetched_at is epoch seconds from the injected
clock. Freshness is decided by the caller, so an expired entry can still be served
as stale. A Postgres failure is logged and ignored: the memory copy keeps working.
"""
import json
import logging
import threading

import psycopg

log = logging.getLogger("football.cache")

DDL = """
CREATE TABLE IF NOT EXISTS api_cache (
    key        text PRIMARY KEY,
    fetched_at double precision NOT NULL,
    body       jsonb NOT NULL
)
"""


class Cache:
    def __init__(self, database_url=None):
        self.database_url = database_url
        self._mem = {}
        self._lock = threading.Lock()
        if database_url:
            try:
                with psycopg.connect(database_url, connect_timeout=5) as conn:
                    conn.execute(DDL)
            except psycopg.Error as exc:
                log.warning("cache table setup failed: %s", type(exc).__name__)

    def get(self, key):
        """Return (fetched_at, body) for the newest copy, or None."""
        with self._lock:
            best = self._mem.get(key)
        if self.database_url:
            try:
                with psycopg.connect(self.database_url, connect_timeout=5) as conn:
                    row = conn.execute(
                        "SELECT fetched_at, body FROM api_cache WHERE key = %s", (key,)
                    ).fetchone()
                if row and (best is None or row[0] > best[0]):
                    best = (row[0], row[1])
                    with self._lock:
                        self._mem[key] = best
            except psycopg.Error as exc:
                log.warning("cache read failed: %s", type(exc).__name__)
        return best

    def put(self, key, fetched_at, body):
        with self._lock:
            self._mem[key] = (fetched_at, body)
        if self.database_url:
            try:
                with psycopg.connect(self.database_url, connect_timeout=5) as conn:
                    conn.execute(
                        "INSERT INTO api_cache (key, fetched_at, body) VALUES (%s, %s, %s) "
                        "ON CONFLICT (key) DO UPDATE SET fetched_at = EXCLUDED.fetched_at, "
                        "body = EXCLUDED.body",
                        (key, fetched_at, json.dumps(body)),
                    )
            except psycopg.Error as exc:
                log.warning("cache write failed: %s", type(exc).__name__)
