import logging

from src.data_collection import scheduler


def test_main_exits_without_api_key(caplog):
    with caplog.at_level(logging.ERROR):
        assert scheduler.main() == 1
    assert "WEATHER_API_KEY" in caplog.text


def test_collect_once_survives_crash(monkeypatch, caplog):
    def explode():
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(scheduler, "run_collection", explode)
    with caplog.at_level(logging.ERROR):
        scheduler.collect_once()
    assert "Collection run crashed" in caplog.text
