import asyncio
import json
import threading
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from src.api.app import create_app
from src.api.events import ChangeNotifier, DataVersion, TooManySubscribersError, changes
from src.database import repository
from src.database.models import CollectionRun
from src.database.session import session_scope
from src.utils.config import get_settings

T1 = datetime(2026, 10, 21, 14, 0, tzinfo=UTC)
T2 = datetime(2026, 10, 21, 14, 5, tzinfo=UTC)


def version(run_id=1, finished=T1, kinds="current", ids=(1,)):
    return DataVersion(run_id, finished, kinds, frozenset(ids))


def test_changes_reports_new_runs_and_location_changes():
    assert changes(version(), version()) == []
    assert changes(version(), version(run_id=2, finished=T2, kinds="forecast,air_quality")) == [
        ("data", {"run_id": 2, "kinds": ["forecast", "air_quality"], "finished_at": T2.isoformat()})
    ]
    assert changes(version(ids=(1, 2)), version(ids=(2, 3))) == [
        ("locations", {"added": [3], "removed": [1]})
    ]


def test_first_run_ever_is_reported():
    empty = DataVersion(None, None, None, frozenset())
    assert changes(empty, version(ids=()))[0][0] == "data"


def run(coro):
    return asyncio.run(coro)


def test_notifier_baselines_then_publishes_changes():
    versions = iter([version(), version(), version(run_id=2, finished=T2)])
    notifier = ChangeNotifier(0.01, version_reader=lambda: next(versions))

    async def scenario():
        queue = notifier.subscribe()
        await notifier.check()  # baseline: nothing published
        await notifier.check()  # unchanged
        assert queue.empty()
        await notifier.check()
        return queue.get_nowait()

    event, data = run(scenario())
    assert event == "data"
    assert data["run_id"] == 2


def test_slow_subscribers_keep_the_latest_events():
    notifier = ChangeNotifier(1)

    async def scenario():
        queue = notifier.subscribe()
        for i in range(40):
            notifier.publish("data", {"run_id": i})
        items = [queue.get_nowait() for _ in range(queue.qsize())]
        return items

    items = run(scenario())
    assert items[-1] == ("data", {"run_id": 39})
    assert len(items) == 16


def test_ensure_baseline_only_reads_once():
    reads = []

    def reader():
        reads.append(1)
        return version()

    notifier = ChangeNotifier(1, version_reader=reader)

    async def scenario():
        await notifier.ensure_baseline()
        await notifier.ensure_baseline()

    run(scenario())
    assert len(reads) == 1


def test_subscriber_limit_and_rebaseline():
    notifier = ChangeNotifier(1, version_reader=version, max_subscribers=1)

    async def scenario():
        queue = notifier.subscribe()
        with pytest.raises(TooManySubscribersError):
            notifier.subscribe()
        await notifier.check()
        notifier.unsubscribe(queue)
        return notifier._version

    assert run(scenario()) is None


def read_events(lines, count: int, timeout: float = 10) -> list[tuple[str, dict]]:
    """Read `count` SSE events (ignoring keep-alive comments) with a hard timeout."""
    events: list[tuple[str, dict]] = []

    def reader():
        event = None
        for line in lines:
            if line.startswith("event:"):
                event = line.split(":", 1)[1].strip()
            elif line.startswith("data:") and event:
                events.append((event, json.loads(line.split(":", 1)[1])))
                event = None
                if len(events) >= count:
                    return

    thread = threading.Thread(target=reader, daemon=True)
    thread.start()
    thread.join(timeout)
    assert len(events) >= count, f"only received {events}"
    return events


@pytest.fixture
def live_client(app_db, monkeypatch):
    monkeypatch.setenv("EVENTS_POLL_SECONDS", "0.05")
    get_settings.cache_clear()
    with TestClient(create_app()) as client:
        yield client


def test_event_stream_pushes_finished_runs_and_new_locations(live_client):
    with live_client.stream("GET", "/api/events") as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        lines = response.iter_lines()
        assert read_events(lines, 1)[0] == ("ready", {"poll_seconds": 0.05})

        # Change the data immediately after "ready"; it must still be reported.
        with session_scope() as session:
            repository.add_location(session, name="Oslo", country="NO", lat=59.91, lon=10.75)
            session.add(
                CollectionRun(started_at=T1, finished_at=T2, status="success", kinds="current")
            )

        received = dict(read_events(lines, 2))
        assert received["data"]["kinds"] == ["current"]
        assert received["locations"]["added"]


def test_event_stream_rejects_when_full(live_client):
    live_client.app.state.notifier.max_subscribers = 0
    assert live_client.get("/api/events").status_code == 503
