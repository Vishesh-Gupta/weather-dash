"""Background service that collects weather data on per-kind intervals.

Current conditions, air quality and forecasts each have their own interval
(see config.yaml). Run with `python -m src.data_collection.scheduler`.
"""

import logging
import signal
import sys
import threading

import schedule

from src.data_collection.collector import ALL_KINDS, Kind, run_collection
from src.database.setup import init_db
from src.utils.config import Settings, get_settings

logger = logging.getLogger(__name__)


def collect_once(kinds: frozenset[Kind] = ALL_KINDS) -> None:
    try:
        run = run_collection(kinds=kinds)
        logger.info(
            "Run %s (%s) finished with status=%s (%d locations)",
            run.id,
            run.kinds,
            run.status,
            run.locations_processed,
        )
    except Exception:
        # Never let a bad run kill the service; the next interval will try again.
        logger.exception("Collection run crashed")


def intervals(settings: Settings) -> dict[Kind, int]:
    every = {
        Kind.CURRENT: settings.current_interval_minutes,
        Kind.AIR_QUALITY: settings.air_quality_interval_minutes,
        Kind.FORECAST: settings.forecast_interval_minutes,
        Kind.HOURLY: settings.hourly_interval_minutes,
    }
    if settings.one_call_enabled:
        every[Kind.ALERTS] = settings.alerts_interval_minutes
    return every


def schedule_jobs(scheduler: schedule.Scheduler, settings: Settings) -> None:
    for kind, minutes in intervals(settings).items():
        scheduler.every(minutes).minutes.do(collect_once, frozenset({kind}))
        logger.info("Collecting %s every %d minutes", kind.value, minutes)


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

    scheduler = schedule.Scheduler()
    schedule_jobs(scheduler, settings)
    collect_once()  # Everything once at startup, then each kind on its interval.

    while not stop.is_set():
        scheduler.run_pending()
        stop.wait(timeout=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
