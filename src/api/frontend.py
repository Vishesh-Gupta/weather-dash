"""Serve the built React app from the API process, same-origin with /api.

Hashed files under /assets are cached for a year; everything else that isn't an
API route falls back to index.html so client-side routes work on reload.
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

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


class SecurityHeadersMiddleware:
    """Add security headers to every HTTP response.

    Plain ASGI rather than BaseHTTPMiddleware so streamed responses (the live
    event stream) pass straight through.
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        # The interactive API docs load their UI from a CDN, so they keep the default policy.
        skip_csp = scope["path"].startswith("/api/docs")

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in SECURITY_HEADERS.items():
                    if skip_csp and name == "Content-Security-Policy":
                        continue
                    headers.setdefault(name, value)
            await send(message)

        await self.app(scope, receive, send_with_headers)


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
