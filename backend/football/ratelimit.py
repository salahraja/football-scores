import threading
from collections import OrderedDict, deque


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

    def try_acquire(self, reserve=0):
        """Take a slot, unless that would leave fewer than `reserve` for callers who may use them."""
        with self._lock:
            now = self.clock()
            while self._stamps and now - self._stamps[0] >= self.window:
                self._stamps.popleft()
            if len(self._stamps) >= self.limit - reserve:
                return False
            self._stamps.append(now)
            return True


class PerKeyLimiter:
    """A RateLimiter per key (here: per client address); the least recently used keys go first."""

    MAX_KEYS = 5000

    def __init__(self, limit, window, clock):
        self.limit, self.window, self.clock = limit, window, clock
        self._limiters = OrderedDict()
        self._lock = threading.Lock()

    def try_acquire(self, key):
        with self._lock:
            limiter = self._limiters.get(key)
            if limiter is None:
                limiter = self._limiters[key] = RateLimiter(self.limit, self.window, self.clock)
                while len(self._limiters) > self.MAX_KEYS:
                    self._limiters.popitem(last=False)
            else:
                self._limiters.move_to_end(key)
        return limiter.try_acquire()
