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


def test_each_kind_gets_its_own_job(monkeypatch):
    import schedule

    from src.data_collection.collector import Kind
    from src.utils.config import get_settings

    monkeypatch.setenv("CURRENT_INTERVAL_MINUTES", "5")
    monkeypatch.setenv("AIR_QUALITY_INTERVAL_MINUTES", "30")
    monkeypatch.setenv("FORECAST_INTERVAL_MINUTES", "60")
    monkeypatch.setenv("HOURLY_INTERVAL_MINUTES", "15")
    get_settings.cache_clear()

    jobs = schedule.Scheduler()
    scheduler.schedule_jobs(jobs, get_settings())
    by_kind = {next(iter(job.job_func.args[0])): job.interval for job in jobs.jobs}
    assert by_kind == {
        Kind.CURRENT: 5,
        Kind.AIR_QUALITY: 30,
        Kind.FORECAST: 60,
        Kind.HOURLY: 15,
    }


def test_collect_once_passes_kinds(monkeypatch):
    from src.data_collection.collector import Kind
    from src.database.models import CollectionRun

    seen = []
    monkeypatch.setattr(
        scheduler,
        "run_collection",
        lambda kinds: seen.append(kinds) or CollectionRun(id=1, status="success", kinds="current"),
    )
    scheduler.collect_once(frozenset({Kind.CURRENT}))
    assert seen == [frozenset({Kind.CURRENT})]


def test_alerts_are_scheduled_only_when_enabled(monkeypatch):
    import schedule

    from src.data_collection.collector import Kind
    from src.utils.config import get_settings

    get_settings.cache_clear()
    jobs = schedule.Scheduler()
    scheduler.schedule_jobs(jobs, get_settings())
    assert Kind.ALERTS not in {next(iter(job.job_func.args[0])) for job in jobs.jobs}

    monkeypatch.setenv("ONE_CALL_ENABLED", "1")
    monkeypatch.setenv("ALERTS_INTERVAL_MINUTES", "20")
    get_settings.cache_clear()
    jobs = schedule.Scheduler()
    scheduler.schedule_jobs(jobs, get_settings())
    by_kind = {next(iter(job.job_func.args[0])): job.interval for job in jobs.jobs}
    assert by_kind[Kind.ALERTS] == 20
