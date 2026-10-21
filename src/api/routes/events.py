from collections.abc import AsyncIterable

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.sse import EventSourceResponse, ServerSentEvent

from src.api.events import ChangeNotifier

router = APIRouter(tags=["events"])


def get_notifier(request: Request) -> ChangeNotifier:
    notifier: ChangeNotifier = request.app.state.notifier
    # Checked before streaming starts, so the client gets a real 503.
    if notifier.subscriber_count >= notifier.max_subscribers:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Too many live connections")
    return notifier


# Browsers reconnect after this many milliseconds if the stream drops.
RECONNECT_MS = 5000


@router.get("/events", response_class=EventSourceResponse)
async def events(
    notifier: ChangeNotifier = Depends(get_notifier),
) -> AsyncIterable[ServerSentEvent]:
    """Live updates. Emits `data` when a collection run finishes (with the kinds it
    collected) and `locations` when locations are added or removed."""
    queue = notifier.subscribe()
    try:
        # Baseline before "ready": anything stored after the client sees it gets pushed.
        await notifier.ensure_baseline()
        yield ServerSentEvent(
            event="ready", data={"poll_seconds": notifier.poll_seconds}, retry=RECONNECT_MS
        )
        while True:
            event, data = await queue.get()
            yield ServerSentEvent(event=event, data=data)
    finally:
        notifier.unsubscribe(queue)
