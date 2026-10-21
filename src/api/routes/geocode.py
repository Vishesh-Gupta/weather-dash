from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from src.api.deps import AdminOnly, NeedsApiKey
from src.api.schemas import GeocodeResult
from src.data_collection.openweather import OpenWeatherError
from src.utils.locations import search_location

router = APIRouter(prefix="/geocode", tags=["locations"], dependencies=[AdminOnly, NeedsApiKey])


@router.get("", response_model=list[GeocodeResult])
def geocode(q: Annotated[str, Query(min_length=1, max_length=200)]):
    """Search places by name (uses OpenWeather quota, so admin only)."""
    try:
        return search_location(q)
    except OpenWeatherError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
