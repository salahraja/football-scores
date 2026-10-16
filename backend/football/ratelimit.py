import threading
from collections import deque


class RateLimiter:
    """At most `limit` acquisitions in any `window` seconds.

    A sliding window rather than a refilling bucket: a bucket that holds 9 tokens and
    refills 9 a minute can let 18 calls through in one minute, and this must not.
    """

    def __init__(self, limit, window, clock):
        self.limit = limit
        self.window = window
        self.clock = clock
        self._stamps = deque()
        self._lock = threading.Lock()

    def try_acquire(self):
        with self._lock:
            now = self.clock()
            while self._stamps and now - self._stamps[0] >= self.window:
                self._stamps.popleft()
            if len(self._stamps) >= self.limit:
                return False
            self._stamps.append(now)
            return True


class PerKeyLimiter:
    """A RateLimiter per key (here: per client address)."""

    MAX_KEYS = 5000

    def __init__(self, limit, window, clock):
        self.limit, self.window, self.clock = limit, window, clock
        self._limiters = {}
        self._lock = threading.Lock()

    def try_acquire(self, key):
        with self._lock:
            if len(self._limiters) >= self.MAX_KEYS and key not in self._limiters:
                self._limiters.clear()  # crude, but bounds memory under an address flood
            limiter = self._limiters.setdefault(key, RateLimiter(self.limit, self.window, self.clock))
        return limiter.try_acquire()
