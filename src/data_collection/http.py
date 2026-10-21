"""Shared HTTP session with retries and simple client-side rate limiting."""

import time

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

RETRY_STATUSES = (429, 500, 502, 503, 504)


def build_session(retries: int = 3, backoff_factor: float = 1.0) -> requests.Session:
    retry = Retry(
        total=retries,
        backoff_factor=backoff_factor,
        status_forcelist=RETRY_STATUSES,
        allowed_methods=frozenset({"GET"}),
        respect_retry_after_header=True,
        raise_on_status=False,
    )
    session = requests.Session()
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


class RateLimiter:
    """Enforce a minimum delay between consecutive calls."""

    def __init__(self, min_interval: float, clock=time.monotonic, sleep=time.sleep):
        self.min_interval = min_interval
        self._clock = clock
        self._sleep = sleep
        self._last_call: float | None = None

    def wait(self) -> None:
        if self._last_call is not None and self.min_interval > 0:
            remaining = self.min_interval - (self._clock() - self._last_call)
            if remaining > 0:
                self._sleep(remaining)
        self._last_call = self._clock()
