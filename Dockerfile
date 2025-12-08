# syntax=docker/dockerfile:1.4

# Copy uv from official image
FROM ghcr.io/astral-sh/uv:latest AS uv

# Builder stage
FROM python:3.14-slim AS builder

# Install system dependencies for building
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy uv binary from official image
COPY --from=uv /uv /usr/local/bin/uv

WORKDIR /app

# Copy dependency files first for better caching
COPY pyproject.toml uv.lock ./

# Install dependencies only (project will be installed in runtime stage)
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project

# Runtime stage
FROM python:3.14-slim

# Install runtime dependencies (libpq5 for psycopg2 runtime, postgresql-client for psql, gcc for building)
RUN apt-get update && apt-get install -y \
    postgresql-client \
    libpq5 \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy uv binary from builder
COPY --from=builder /usr/local/bin/uv /usr/local/bin/uv
# Copy virtual environment from builder
COPY --from=builder /app/.venv /app/.venv

# Copy project files needed for installation
COPY pyproject.toml ./
COPY src/ src/

# Install the project in editable mode so imports work
RUN uv pip install -e .

COPY config.yaml config.yaml

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app:$PYTHONPATH"
ENV PYTHONUNBUFFERED=1

EXPOSE 8501

# Default command (can be overridden in docker-compose)
CMD ["streamlit", "run", "src/dashboard/app.py", "--server.port=8501", "--server.address=0.0.0.0"]