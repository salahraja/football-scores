"""Response cache: in memory always, plus Postgres when DATABASE_URL is set.

Entries are (fetched_at, body) where fetched_at is epoch seconds from the injected
clock. Freshness is decided by the caller, so an expired entry can still be served
as stale.

Postgres sits behind one connection pool with a short connect timeout and a circuit
breaker: after any database failure the cache runs from memory alone for 60 seconds
before trying the database again, so a dead database costs one slow attempt a minute,
not one per request.
"""
import json
import logging
import threading
import time

import psycopg
import psycopg_pool

log = logging.getLogger("football.cache")

BREAKER_SECONDS = 60
CONNECT_TIMEOUT = 2

DDL = """
CREATE TABLE IF NOT EXISTS api_cache (
    key        text PRIMARY KEY,
    fetched_at double precision NOT NULL,
    body       jsonb NOT NULL
)
"""

_DB_ERRORS = (psycopg.Error, psycopg_pool.PoolTimeout, psycopg_pool.PoolClosed)


class Cache:
    def __init__(self, database_url=None, pool=None, clock=time.monotonic):
        self.database_url = database_url
        self._clock = clock  # for the breaker only; fetched_at comes from the caller
        self._mem = {}
        self._lock = threading.Lock()
        self._down_until = 0.0
        self._pool = pool
        if database_url and pool is None:
            self._pool = psycopg_pool.ConnectionPool(
                database_url,
                min_size=1,
                max_size=4,
                timeout=CONNECT_TIMEOUT,
                kwargs={"connect_timeout": CONNECT_TIMEOUT, "autocommit": True},
                open=True,
            )
        if self._pool is not None:
            self._db(lambda conn: conn.execute(DDL))

    def close(self):
        if self._pool is not None:
            self._pool.close()

    def _db(self, fn):
        """Run fn(conn) on a pooled connection. None if the database is (or just went) down."""
        if self._pool is None or self._clock() < self._down_until:
            return None
        try:
            with self._pool.connection() as conn:
                return fn(conn)
        except _DB_ERRORS as exc:
            self._down_until = self._clock() + BREAKER_SECONDS
            log.warning("database unavailable, using memory for %ss: %s", BREAKER_SECONDS, type(exc).__name__)
            return None

    def get(self, key, min_fetched_at=None):
        """Return (fetched_at, body) for the newest copy, or None.

        A memory entry at least as new as min_fetched_at is final, with no database read.
        """
        with self._lock:
            best = self._mem.get(key)
        if best is not None and min_fetched_at is not None and best[0] >= min_fetched_at:
            return best
        row = self._db(
            lambda conn: conn.execute("SELECT fetched_at, body FROM api_cache WHERE key = %s", (key,)).fetchone()
        )
        if row and (best is None or row[0] > best[0]):
            best = (row[0], row[1])
            with self._lock:
                self._mem[key] = best
        return best

    def put(self, key, fetched_at, body):
        with self._lock:
            self._mem[key] = (fetched_at, body)
        self._db(
            lambda conn: conn.execute(
                "INSERT INTO api_cache (key, fetched_at, body) VALUES (%s, %s, %s) "
                "ON CONFLICT (key) DO UPDATE SET fetched_at = EXCLUDED.fetched_at, "
                "body = EXCLUDED.body",
                (key, fetched_at, json.dumps(body)),
            )
        )
