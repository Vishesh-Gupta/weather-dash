from fastapi import APIRouter, Response, status
from sqlalchemy import text

from src.api.deps import DbSession
from src.api.schemas import HealthOut

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthOut)
def health(db: DbSession, response: Response):
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return HealthOut(status="error", database="unavailable")
    return HealthOut(status="ok", database="ok")
