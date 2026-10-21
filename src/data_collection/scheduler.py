"""Background service that collects weather data on a fixed interval.

Run with `python -m src.data_collection.scheduler`.
"""

import logging
import signal
import sys
import threading

import schedule

from src.data_collection.collector import run_collection
from src.database.setup import init_db
from src.utils.config import get_settings

logger = logging.getLogger(__name__)


def collect_once() -> None:
    try:
        run = run_collection()
        logger.info(
            "Run %s finished with status=%s (%d locations)",
            run.id,
            run.status,
            run.locations_processed,
        )
    except Exception:
        # Never let a bad run kill the service; the next interval will try again.
        logger.exception("Collection run crashed")


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = get_settings()
    if not settings.api_key:
        logger.error("WEATHER_API_KEY is not set; the scheduler cannot collect data")
        return 1

    init_db()
    stop = threading.Event()

    def handle_signal(signum, _frame):
        logger.info("Received %s, shutting down", signal.Signals(signum).name)
        stop.set()

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    interval = settings.scheduler_interval_minutes
    logger.info("Collecting every %d minutes", interval)
    collect_once()
    schedule.every(interval).minutes.do(collect_once)

    while not stop.is_set():
        schedule.run_pending()
        stop.wait(timeout=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
