FROM python:3.14-slim as builder

COPY -from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv/

WORKDIR /app

COPY pyproject.toml uv.lock ./

RUN uv sync --frozen --no-install-project

FROM python:3.14-slim

WORKDIR /app

COPY --from=builder /usr/local/bin/uv /usr/local/bin/uv/
COPY --from=builder /app/.venv /app/.venv

COPY src/ src/
COPY config.yaml config.yaml

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

EXPOSE 8501

CMD ["streamlit", "run", "src/app.py"]