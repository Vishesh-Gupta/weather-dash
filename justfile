run:
    uv run streamlit run src/dashboard/app.py

scheduler:
    uv run python -m src.data_collection.scheduler

test:
    uv run pytest tests/

test-cov:
    uv run pytest tests/ --cov=src --cov-report=html

format:
    uv run black src/ tests/

lint:
    uv run ruff check src/ tests/

lint-fix:
    uv run ruff check --fix src/ tests/

install:
    uv sync

setup-db:
    uv run python -m src.db.setup

clean:
    rm -rf .venv
    rm -rf __pycache__
    find . -type d -name __pycache__ -exec rm -r {} +
    find . -type f -name "*.pyc" -delete

default:
    just --list