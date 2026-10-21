import requests
from dotenv import load_dotenv

from .config import get_api_key

load_dotenv()


def search_location(query: str) -> list[dict]:
    """Search for locations using OpenWeatherMap Geocoding API."""
    api_key = get_api_key()
    if not api_key:
        raise ValueError("WEATHER_API_KEY not found in environment or config")

    url = "https://api.openweathermap.org/geo/1.0/direct"

    params = {"q": query, "limit": 5, "appid": api_key}

    response = requests.get(url, params=params)
    response.raise_for_status()

    results = []
    for item in response.json():
        results.append(
            {
                "name": f"{item['name']}, {item.get('state', '')}, {item['country']}".strip(", "),
                "lat": item["lat"],
                "lon": item["lon"],
                "country": item["country"],
            }
        )

    return results
