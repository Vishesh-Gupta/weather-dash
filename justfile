default:
    @just --list

# Install Python and frontend dependencies
install:
    uv sync
    cd frontend && pnpm install

# API with auto-reload on :8000 (serves frontend/dist when built)
api:
    uv run uvicorn src.api.app:app --reload --port 8000

# Frontend dev server on :5173, proxying /api to the API
web:
    cd frontend && pnpm dev

scheduler:
    uv run python -m src.data_collection.scheduler

setup-db:
    uv run python -m src.database.setup

# Regenerate openapi.json and the frontend's API types after changing the API
openapi:
    uv run python -m scripts.export_openapi
    cd frontend && pnpm generate:api

test:
    uv run pytest tests/
    cd frontend && pnpm test

test-cov:
    uv run pytest tests/ --cov=src --cov-report=term-missing --cov-report=html

format:
    uv run ruff format src/ tests/ scripts/
    cd frontend && pnpm format

lint:
    uv run ruff check src/ tests/ scripts/
    uv run ruff format --check src/ tests/ scripts/
    cd frontend && pnpm lint && pnpm format:check && pnpm typecheck

lint-fix:
    uv run ruff check --fix src/ tests/ scripts/

# Lint and test everything, as CI does
check: lint test

build:
    cd frontend && pnpm build

docker-build:
    docker compose build

up:
    docker compose up -d --build

down:
    docker compose down

logs:
    docker compose logs -f

clean:
    rm -rf .venv .pytest_cache .coverage htmlcov frontend/node_modules frontend/dist
    find . -type d -name __pycache__ -not -path "./frontend/*" -exec rm -r {} +
