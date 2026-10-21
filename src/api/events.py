"""Live change feed: detect newly collected data and push it to open browsers.

The scheduler runs in its own process, so the API learns about new data by
checking the database. One check every `events_poll_seconds` serves every
connected browser, and none run while nobody is connected.
"""

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import anyio
from sqlalchemy import select

from src.database.models import CollectionRun, Location
from src.database.session import session_scope

logger = logging.getLogger(__name__)

MAX_SUBSCRIBERS = 1000
QUEUE_SIZE = 16


@dataclass(frozen=True)
class DataVersion:
    run_id: int | None
    run_finished_at: datetime | None
    run_kinds: str | None
    location_ids: frozenset[int]


def read_version() -> DataVersion:
    with session_scope() as session:
        run = session.execute(
            select(CollectionRun.id, CollectionRun.finished_at, CollectionRun.kinds)
            .where(CollectionRun.finished_at.is_not(None))
            .order_by(CollectionRun.finished_at.desc(), CollectionRun.id.desc())
            .limit(1)
        ).first()
        location_ids = frozenset(
            session.scalars(select(Location.id).where(Location.is_active.is_(True)))
        )
    return DataVersion(
        run_id=run.id if run else None,
        run_finished_at=run.finished_at if run else None,
        run_kinds=run.kinds if run else None,
        location_ids=location_ids,
    )


def changes(old: DataVersion, new: DataVersion) -> list[tuple[str, dict[str, Any]]]:
    """Events describing what changed between two versions."""
    events: list[tuple[str, dict[str, Any]]] = []
    if new.run_id is not None and (new.run_id, new.run_finished_at) != (
        old.run_id,
        old.run_finished_at,
    ):
        events.append(
            (
                "data",
                {
                    "run_id": new.run_id,
                    "kinds": new.run_kinds.split(",") if new.run_kinds else [],
                    "finished_at": new.run_finished_at.isoformat() if new.run_finished_at else None,
                },
            )
        )
    if new.location_ids != old.location_ids:
        events.append(
            (
                "locations",
                {
                    "added": sorted(new.location_ids - old.location_ids),
                    "removed": sorted(old.location_ids - new.location_ids),
                },
            )
        )
    return events


class TooManySubscribersError(RuntimeError):
    pass


class ChangeNotifier:
    def __init__(
        self,
        poll_seconds: float,
        version_reader: Callable[[], DataVersion] = read_version,
        max_subscribers: int = MAX_SUBSCRIBERS,
    ):
        self.poll_seconds = poll_seconds
        self.read_version = version_reader
        self.max_subscribers = max_subscribers
        self._subscribers: set[asyncio.Queue[tuple[str, dict[str, Any]]]] = set()
        self._version: DataVersion | None = None

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    def subscribe(self) -> asyncio.Queue[tuple[str, dict[str, Any]]]:
        if len(self._subscribers) >= self.max_subscribers:
            raise TooManySubscribersError
        queue: asyncio.Queue[tuple[str, dict[str, Any]]] = asyncio.Queue(maxsize=QUEUE_SIZE)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._subscribers.discard(queue)
        if not self._subscribers:
            # Re-baseline on the next connection instead of replaying stale changes.
            self._version = None

    def publish(self, event: str, data: dict[str, Any]) -> None:
        for queue in list(self._subscribers):
            if queue.full():
                # A slow client only needs the latest state; drop its oldest event.
                queue.get_nowait()
            queue.put_nowait((event, data))

    async def ensure_baseline(self) -> None:
        """Record the current state if none is held, so later changes are all reported."""
        if self._version is None:
            self._version = await anyio.to_thread.run_sync(self.read_version)

    async def check(self) -> None:
        """Compare the database with the last seen version and publish any changes."""
        version = await anyio.to_thread.run_sync(self.read_version)
        if self._version is not None:
            for event, data in changes(self._version, version):
                self.publish(event, data)
        self._version = version

    async def run(self) -> None:
        while True:
            if self._subscribers:
                try:
                    await self.check()
                except Exception:
                    logger.exception("Checking for new data failed")
            await asyncio.sleep(self.poll_seconds)
