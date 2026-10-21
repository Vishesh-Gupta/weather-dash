# syntax=docker/dockerfile:1.28

# --- Frontend: build the React app -------------------------------------------
FROM node:24-alpine AS frontend
WORKDIR /frontend
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

# --- Python dependencies -----------------------------------------------------
FROM ghcr.io/astral-sh/uv:0.13.4 AS uv

FROM python:3.13-slim AS python-deps
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
# Runtime dependencies only; the application runs from /app/src rather than being installed.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# --- Runtime -------------------------------------------------------------------
FROM python:3.13-slim
WORKDIR /app
RUN useradd --create-home --uid 1000 weather
COPY --from=python-deps /app/.venv /app/.venv
COPY src/ src/
COPY config.yaml ./
COPY --from=frontend /frontend/dist frontend/dist

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER weather
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"]

# Web app and API. The scheduler service overrides this command.
CMD ["uvicorn", "src.api.app:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
