"""FastAPI application. Run with `uvicorn src.api.app:app`.

Visitors get read-only access to all collected data. Managing locations and
triggering collection require admin sign-in when ADMIN_PASSWORD is set.
"""

import logging
import secrets
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.sessions import SessionMiddleware

from src.api.frontend import SecurityHeadersMiddleware, mount_frontend
from src.api.routes import collection, geocode, health, locations, session
from src.database.setup import init_db
from src.utils.config import Settings, get_settings

logger = logging.getLogger(__name__)

SESSION_MAX_AGE_SECONDS = 7 * 24 * 3600


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(
        title="Weather Analytics API",
        version="1.0.0",
        description="Current conditions, forecasts, air quality and history for tracked locations. "
        "Values are metric and timestamps UTC.",
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )

    secret = settings.session_secret
    if not secret:
        if settings.admin_password:
            logger.warning("SESSION_SECRET is not set; admin sessions end when the API restarts")
        secret = secrets.token_urlsafe(32)
    app.add_middleware(
        SessionMiddleware,
        secret_key=secret,
        session_cookie="weather_session",
        max_age=SESSION_MAX_AGE_SECONDS,
        same_site="strict",
        https_only=settings.session_cookie_secure,
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(SecurityHeadersMiddleware)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_credentials=True,
            allow_methods=["GET", "POST", "DELETE"],
            allow_headers=["Content-Type"],
        )

    api = APIRouter(prefix="/api")
    for module in (health, session, locations, geocode, collection):
        api.include_router(module.router)
    app.include_router(api)

    # Registered last so its catch-all route never shadows the API.
    if mount_frontend(app, settings.frontend_dist):
        logger.info("Serving frontend from %s", settings.frontend_dist)
    return app


app = create_app()
