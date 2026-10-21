from datetime import date, timedelta

from src.api.climate import DailyRecord, normal_for, normals_between


def history(years=(2021, 2022, 2023, 2024, 2025), high=10.0):
    rows = []
    for year in years:
        day = date(year, 1, 1)
        while day.year == year:
            # Each year is 1° warmer than the last, so means are easy to check.
            offset = year - years[0]
            rows.append(
                DailyRecord(
                    day,
                    high + offset,
                    high - 10 + offset,
                    high - 5 + offset,
                    2.0 if day.day % 2 else 0.0,
                )
            )
            day += timedelta(days=1)
    return rows


def test_normal_averages_same_dates_in_past_years():
    normal = normal_for(date(2026, 7, 15), history())
    assert normal.years == 5
    assert normal.temp_max == 12.0  # mean of 10..14
    assert normal.temp_min == 2.0
    assert normal.temp_mean == 7.0
    assert normal.record_high.value == 14.0
    assert normal.record_high.date.year == 2025
    assert normal.record_low.value == 0.0
    assert normal.record_low.date.year == 2021


def test_wet_day_chance_and_precipitation():
    normal = normal_for(date(2026, 7, 15), history())
    assert 0.4 < normal.wet_day_chance < 0.6
    assert 0.8 < normal.precipitation < 1.2


def test_window_wraps_around_new_year():
    rows = [DailyRecord(date(2024, 12, 30), 1.0, -5.0, -2.0, 0.0)]
    assert normal_for(date(2026, 1, 3), rows).years == 1
    assert normal_for(date(2026, 1, 20), rows).years == 0


def test_this_seasons_days_are_not_their_own_baseline():
    rows = [DailyRecord(date(2025, 12, 30), 1.0, -5.0, -2.0, 0.0)]
    assert normal_for(date(2026, 1, 3), rows).years == 0


def test_never_compares_a_day_with_itself_or_later_days():
    rows = history(years=(2025, 2026))
    normal = normal_for(date(2026, 3, 1), rows)
    assert normal.years == 1
    assert normal.temp_max == 10.0


def test_leap_day_is_supported():
    assert normal_for(date(2028, 2, 29), history()).years == 5


def test_no_history():
    normal = normal_for(date(2026, 1, 1), [])
    assert normal.years == 0
    assert normal.temp_mean is None
    assert normal.record_high is None
    assert normal.wet_day_chance is None


def test_range_uses_data_before_the_range_start():
    rows = history(years=(2025, 2026))
    normals = normals_between(date(2026, 3, 1), date(2026, 3, 5), rows)
    assert [n.date.day for n in normals] == [1, 2, 3, 4, 5]
    assert all(n.years == 1 for n in normals)
