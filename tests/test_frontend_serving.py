import pytest
from fastapi.testclient import TestClient

from src.api.app import create_app
from src.utils.config import get_settings


@pytest.fixture
def dist(tmp_path):
    root = tmp_path / "dist"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text("<!doctype html><div id=root></div>")
    (root / "assets" / "index-abc123.js").write_text("console.log('app')")
    (root / "favicon.svg").write_text("<svg/>")
    (root / "sw.js").write_text("self.addEventListener('fetch', () => {})")
    (root / "manifest.webmanifest").write_text('{"name": "Weather"}')
    (tmp_path / "secret.txt").write_text("outside dist")
    return root


@pytest.fixture
def client(app_db, monkeypatch, dist):
    monkeypatch.setenv("FRONTEND_DIST", str(dist))
    get_settings.cache_clear()
    return TestClient(create_app())


def test_serves_index_for_client_routes(client):
    for path in ("/", "/locations/1/history", "/manage"):
        response = client.get(path)
        assert response.status_code == 200
        assert "id=root" in response.text
        assert response.headers["cache-control"] == "no-cache"


def test_head_requests_work(client):
    assert client.head("/locations/1").status_code == 200


def test_hashed_assets_are_cached_long(client):
    response = client.get("/assets/index-abc123.js")
    assert response.status_code == 200
    assert "immutable" in response.headers["cache-control"]
    assert client.get("/favicon.svg").headers["cache-control"] == "public, max-age=3600"


def test_service_worker_and_manifest_are_always_revalidated(client):
    worker = client.get("/sw.js")
    assert worker.headers["cache-control"] == "no-cache"
    assert worker.headers["content-type"].startswith("text/javascript")
    manifest = client.get("/manifest.webmanifest")
    assert manifest.headers["cache-control"] == "no-cache"
    assert manifest.headers["content-type"].startswith("application/manifest+json")


def test_api_routes_are_not_shadowed(client):
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/api/does-not-exist").status_code == 404
    assert client.get("/api").status_code == 404


def test_paths_cannot_escape_dist(client):
    response = client.get("/../secret.txt")
    assert "outside dist" not in response.text
    response = client.get("/assets/%2e%2e/%2e%2e/secret.txt")
    assert "outside dist" not in response.text


def test_security_headers(client):
    headers = client.get("/").headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert "default-src 'self'" in headers["content-security-policy"]
    assert "frame-ancestors 'none'" in headers["content-security-policy"]
    assert "content-security-policy" not in client.get("/api/docs").headers


def test_without_a_build_only_the_api_is_served(app_db, monkeypatch, tmp_path):
    monkeypatch.setenv("FRONTEND_DIST", str(tmp_path / "missing"))
    get_settings.cache_clear()
    client = TestClient(create_app())
    assert client.get("/").status_code == 404
    assert client.get("/api/health").status_code == 200
