from datetime import date

import pytest
import responses

from src.data_collection.http import build_session
from src.data_collection.open_meteo import OpenMeteoClient, OpenMeteoError, parse_daily
from tests.conftest import load_fixture

URL = "https://archive-api.open-meteo.com/v1/archive"


def test_parse_daily_skips_empty_trailing_days():
    rows = parse_daily(load_fixture("open_meteo_daily.json"))
    assert [row["date"] for row in rows] == [
        date(2025, 10, 17),
        date(2025, 10, 18),
        date(2025, 10, 19),
    ]
    assert rows[1]["precipitation_sum"] == 4.6
    assert rows[0]["wind_speed_max"] == 5.4


@responses.activate
def test_daily_history_request():
    responses.get(URL, json=load_fixture("open_meteo_daily.json"))
    client = OpenMeteoClient(session=build_session(backoff_factor=0))
    rows = client.daily_history(43.65, -79.38, date(2025, 10, 17), date(2025, 10, 20))
    assert len(rows) == 3

    params = responses.calls[0].request.params
    assert params["start_date"] == "2025-10-17"
    assert params["wind_speed_unit"] == "ms"
    assert "temperature_2m_mean" in params["daily"]


def test_empty_range_makes_no_request():
    assert OpenMeteoClient().daily_history(0, 0, date(2025, 2, 1), date(2025, 1, 1)) == []


@responses.activate
def test_error_reason_is_reported():
    responses.get(URL, status=400, json={"error": True, "reason": "Latitude must be in range"})
    client = OpenMeteoClient(session=build_session(backoff_factor=0))
    with pytest.raises(OpenMeteoError, match="Latitude must be in range"):
        client.daily_history(999, 0, date(2025, 1, 1), date(2025, 1, 2))
