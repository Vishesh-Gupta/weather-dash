from src.data_collection.openweather import OpenWeatherClient


def search_location(query: str, client: OpenWeatherClient | None = None) -> list[dict]:
    """Search for locations using the OpenWeatherMap Geocoding API."""
    query = query.strip()
    if not query:
        return []
    return (client or OpenWeatherClient()).geocode(query, limit=5)
