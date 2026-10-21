"""Admin sign-in for public deployments.

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
    """Process-wide limit on failed sign-ins, shared by every browser session."""

    def __init__(self, max_failures: int = 10, window_seconds: float = 900, clock=time.monotonic):
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self._clock = clock
        self._failures: deque[float] = deque()
        self._lock = threading.Lock()

    def _prune(self) -> None:
        cutoff = self._clock() - self.window_seconds
        while self._failures and self._failures[0] < cutoff:
            self._failures.popleft()

    def locked(self) -> bool:
        with self._lock:
            self._prune()
            return len(self._failures) >= self.max_failures

    def record_failure(self) -> None:
        with self._lock:
            self._failures.append(self._clock())

    def attempt(self, candidate: str, expected: str) -> bool | None:
        """True on success, False on a wrong password, None while locked out."""
        if self.locked():
            return None
        if password_matches(candidate, expected):
            return True
        self.record_failure()
        return False
