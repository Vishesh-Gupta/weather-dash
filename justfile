default:
    @just --list

install:
    uv sync

run:
    uv run streamlit run src/dashboard/app.py

api:
    uv run uvicorn src.api.app:app --reload --port 8000

scheduler:
    uv run python -m src.data_collection.scheduler

setup-db:
    uv run python -m src.database.setup

test:
    uv run pytest tests/

test-cov:
    uv run pytest tests/ --cov=src --cov-report=term-missing --cov-report=html

format:
    uv run ruff format src/ tests/

lint:
    uv run ruff check src/ tests/
    uv run ruff format --check src/ tests/

lint-fix:
    uv run ruff check --fix src/ tests/

# Lint and test, as CI does
check: lint test

build:
    docker build -t weather-wiz .

docker-run:
    docker run -p 8501:8501 weather-wiz

docker-compose-up:
    docker compose up -d

docker-compose-down:
    docker compose down

docker-compose-logs:
    docker compose logs -f

docker-compose-build:
    docker compose build

clean:
    rm -rf .venv .pytest_cache .coverage htmlcov
    find . -type d -name __pycache__ -exec rm -r {} +
    find . -type f -name "*.pyc" -delete
