from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from sqlalchemy import select

from src.api import collection
from src.api.deps import AdminOnly, DbSession, NeedsApiKey
from src.api.schemas import CollectionRunOut, CollectRequest
from src.database.models import CollectionRun

router = APIRouter(prefix="/collection-runs", tags=["collection"])


@router.get("/latest", response_model=CollectionRunOut | None)
def latest_run(db: DbSession):
    return db.scalar(select(CollectionRun).order_by(CollectionRun.started_at.desc()).limit(1))


@router.post(
    "",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[AdminOnly, NeedsApiKey],
)
def collect_now(background: BackgroundTasks, body: CollectRequest | None = None) -> dict:
    """Start a collection run in the background. Poll `/collection-runs/latest` for the result."""
    if not collection.start_collection(background, body.location_ids if body else None):
        raise HTTPException(status.HTTP_409_CONFLICT, "A collection is already running")
    return {"status": "started"}
