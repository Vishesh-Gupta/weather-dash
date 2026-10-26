"""Admin sign-in helpers for public deployments.

Visitors can browse everything; only a signed-in admin can track or remove
locations and trigger collection (which spends OpenWeather quota).
"""

import hmac
import threading
import time
from collections import deque


def password_matches(candidate: str, expected: str) -> bool:
    return hmac.compare_digest(candidate.encode(), expected.encode())


class LoginThrottle:
    """Limits failed sign-ins per client, with a much higher ceiling across all clients.

    Counting per client means one person guessing can't lock the admin out; the
    shared ceiling still bounds guessing from many addresses (or spoofed ones).
    """

    def __init__(
        self,
        max_failures: int = 10,
        window_seconds: float = 900,
        max_total_failures: int = 200,
        clock=time.monotonic,
    ):
        self.max_failures = max_failures
        self.max_total_failures = max_total_failures
        self.window_seconds = window_seconds
        self._clock = clock
        self._failures: dict[str, deque[float]] = {}
        self._total: deque[float] = deque()
        self._lock = threading.Lock()

    def _prune(self) -> None:
        cutoff = self._clock() - self.window_seconds
        while self._total and self._total[0] < cutoff:
            self._total.popleft()
        for client in list(self._failures):
            times = self._failures[client]
            while times and times[0] < cutoff:
                times.popleft()
            if not times:
                del self._failures[client]

    def locked(self, client: str = "") -> bool:
        with self._lock:
            self._prune()
            return (
                len(self._failures.get(client, ())) >= self.max_failures
                or len(self._total) >= self.max_total_failures
            )

    def record_failure(self, client: str = "") -> None:
        with self._lock:
            now = self._clock()
            self._failures.setdefault(client, deque()).append(now)
            self._total.append(now)

    def attempt(self, candidate: str, expected: str, client: str = "") -> bool | None:
        """True on success, False on a wrong password, None while locked out."""
        if self.locked(client):
            return None
        if password_matches(candidate, expected):
            return True
        self.record_failure(client)
        return False
