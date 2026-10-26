from fastapi import APIRouter, HTTPException, Request, status

from src.api.deps import ADMIN_SESSION_KEY, AppSettings, is_admin, login_throttle
from src.api.schemas import SessionOut, SignIn

router = APIRouter(prefix="/session", tags=["session"])


def _session_out(request: Request, settings) -> SessionOut:
    return SessionOut(
        is_admin=is_admin(request, settings),
        auth_required=bool(settings.admin_password),
        can_collect=bool(settings.api_key),
    )


@router.get("", response_model=SessionOut)
def get_session(request: Request, settings: AppSettings):
    return _session_out(request, settings)


@router.post("", response_model=SessionOut)
def sign_in(body: SignIn, request: Request, settings: AppSettings):
    if not settings.admin_password:
        return _session_out(request, settings)
    # Behind a proxy this is the forwarded address (uvicorn --proxy-headers).
    client = request.client.host if request.client else ""
    result = login_throttle.attempt(body.password, settings.admin_password, client)
    if result is None:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many failed attempts. Try again in a few minutes.",
        )
    if result is False:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")
    request.session[ADMIN_SESSION_KEY] = True
    return _session_out(request, settings)


@router.delete("", response_model=SessionOut)
def sign_out(request: Request, settings: AppSettings):
    request.session.clear()
    return _session_out(request, settings)
