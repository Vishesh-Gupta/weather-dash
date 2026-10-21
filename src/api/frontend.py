"""Serve the built React app from the API process, same-origin with /api.

Hashed files under /assets are cached for a year; everything else that isn't an
API route falls back to index.html so client-side routes work on reload.
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from starlette.middleware.base import BaseHTTPMiddleware

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; "
        "base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    ),
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        for name, value in SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        # The interactive API docs load their UI from a CDN, so they keep the default policy.
        if request.url.path.startswith("/api/docs"):
            del response.headers["Content-Security-Policy"]
        return response


def mount_frontend(app: FastAPI, dist: Path) -> bool:
    """Serve `dist` if it contains a build. Returns whether the frontend was mounted."""
    index = dist / "index.html"
    if not index.is_file():
        return False
    root = dist.resolve()

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def frontend(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "Not Found")
        candidate = (root / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(root):
            immutable = candidate.parent == root / "assets"
            headers = {
                "Cache-Control": "public, max-age=31536000, immutable"
                if immutable
                else "public, max-age=3600"
            }
            return FileResponse(candidate, headers=headers)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    return True
