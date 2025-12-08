# Weather Analytics Dashboard

A powerful tool for analyzing and visualizing weather data patterns with automated data collection.

## Features

- 🌍 Search and track weather for locations worldwide
- 📊 Interactive weather dashboards with beautiful visualizations
- 📈 Historical weather data analysis
- 🤖 Automated data collection scheduler
- 🐘 PostgreSQL database for reliable data storage
- 🐳 Fully containerized with Docker Compose

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- OpenWeatherMap API key ([Get one here](https://openweathermap.org/api))

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd weather-analytics-dashboard
```

2. Create a `.env` file from the example:
```bash
cp .env.example .env
```

3. Edit `.env` and add your OpenWeatherMap API key:
```env
WEATHER_API_KEY=your_actual_api_key_here
```

4. Start all services (with BuildKit for better caching):
```bash
DOCKER_BUILDKIT=1 docker-compose up -d --build
```

Or enable BuildKit permanently:
```bash
export DOCKER_BUILDKIT=1
docker-compose up -d --build
```

5. Access the dashboard at http://localhost:8501

### Services

The Docker Compose setup includes:

- **Dashboard**: Streamlit web application (port 8501)
- **Scheduler**: Background service that collects weather data at regular intervals
- **PostgreSQL**: Database for storing weather data

### Configuration

Edit `.env` to customize:

- `WEATHER_API_KEY`: Your OpenWeatherMap API key (required)
- `POSTGRES_USER`: PostgreSQL username (default: weather_user)
- `POSTGRES_PASSWORD`: PostgreSQL password (default: weather_pass)
- `POSTGRES_DB`: Database name (default: weather_db)
- `SCHEDULER_INTERVAL_MINUTES`: How often to collect data (default: 60 minutes)
- `DASHBOARD_PORT`: Port for the dashboard (default: 8501)

### Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# View dashboard logs only
docker-compose logs -f dashboard

# View scheduler logs only
docker-compose logs -f scheduler

# Stop all services
docker-compose down

# Stop and remove volumes (deletes database)
docker-compose down -v

# Rebuild containers
docker-compose build

# Restart a specific service
docker-compose restart dashboard
```

## Development

### Local Development (without Docker)

1. Install dependencies:
```bash
uv sync
```

2. Set up environment variables:
```bash
export WEATHER_API_KEY=your_key_here
```

3. Initialize database:
```bash
just setup-db
```

4. Run dashboard:
```bash
just run
```

5. Run scheduler (in another terminal):
```bash
just scheduler
```

## Architecture

- **Dashboard**: Streamlit application for visualizing weather data
- **Scheduler**: Background service that periodically collects weather data for all tracked locations
- **Database**: PostgreSQL database (or SQLite for local development)
- **Data Collection**: OpenWeatherMap API integration with rate limiting

## License

MIT

