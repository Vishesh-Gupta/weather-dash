run:
    uv run streamlit run src/dashboard/app.py

scheduler:
    uv run python -m src.data_collection.scheduler

build:
    docker build -t weather-wiz .

docker-run:
    docker run -p 8501:8501 weather-wiz

docker-compose-up:
    docker-compose up -d

docker-compose-down:
    docker-compose down

docker-compose-logs:
    docker-compose logs -f

docker-compose-build:
    docker-compose build

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
    uv run python -m src.database.setup

clean:
    rm -rf .venv
    rm -rf __pycache__
    find . -type d -name __pycache__ -exec rm -r {} +
    find . -type f -name "*.pyc" -delete

default:
    just --list