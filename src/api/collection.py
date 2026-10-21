"""Run collections triggered from the API in the background, one at a time."""

import logging
import threading

from fastapi import BackgroundTasks

from src.data_collection.collector import run_collection

logger = logging.getLogger(__name__)

_running = threading.Lock()


def is_running() -> bool:
    return _running.locked()


def _run(location_ids: list[int] | None) -> None:
    try:
        run = run_collection(location_ids=location_ids)
        logger.info("API-triggered run %s finished: %s", run.id, run.status)
    except Exception:
        logger.exception("API-triggered collection failed")
    finally:
        _running.release()


def start_collection(background: BackgroundTasks, location_ids: list[int] | None = None) -> bool:
    """Queue a collection to run after the response is sent.

    Returns False without queuing anything if a collection is already running.
    """
    if not _running.acquire(blocking=False):
        return False
    background.add_task(_run, location_ids)
    return True
