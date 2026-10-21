"""FastAPI dependencies: database sessions, settings and admin checks."""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from src.database.session import session_scope
from src.utils.auth import LoginThrottle
from src.utils.config import Settings, get_settings

ADMIN_SESSION_KEY = "admin"

login_throttle = LoginThrottle()


def get_db() -> Iterator[Session]:
    with session_scope() as session:
        yield session


def settings_dep() -> Settings:
    return get_settings()


DbSession = Annotated[Session, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(settings_dep)]


def is_admin(request: Request, settings: Settings) -> bool:
    # Without an admin password (local use) everyone may manage locations.
    if not settings.admin_password:
        return True
    return request.session.get(ADMIN_SESSION_KEY) is True


def require_admin(request: Request, settings: AppSettings) -> None:
    if not is_admin(request, settings):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Admin sign-in required")


def require_api_key(settings: AppSettings) -> None:
    if not settings.api_key:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "WEATHER_API_KEY is not configured on the server"
        )


AdminOnly = Depends(require_admin)
NeedsApiKey = Depends(require_api_key)
