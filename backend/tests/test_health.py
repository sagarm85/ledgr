"""
Health endpoint tests — validate /api/health response structure and values.
"""

VALID_STATUSES = {"healthy", "degraded", "unavailable", "unknown"}


def test_health_returns_200(client):
    r = client.get("/api/health")
    assert r.status_code == 200


def test_health_has_status_field(client):
    r = client.get("/api/health")
    data = r.json()
    assert "status" in data
    assert data["status"] in {"healthy", "degraded"}


def test_health_has_services_field(client):
    r = client.get("/api/health")
    data = r.json()
    assert "services" in data
    assert isinstance(data["services"], dict)


def test_health_services_have_known_keys(client):
    r = client.get("/api/health")
    services = r.json()["services"]
    expected = {"elasticsearch", "clickhouse", "ollama", "kafka"}
    assert expected == set(services.keys())


def test_health_service_values_are_valid_statuses(client):
    r = client.get("/api/health")
    for svc, status in r.json()["services"].items():
        assert status in VALID_STATUSES, f"{svc} has unexpected status: {status!r}"


def test_health_elasticsearch_reachable(client):
    r = client.get("/api/health")
    assert r.json()["services"]["elasticsearch"] in {"healthy", "degraded"}


def test_health_clickhouse_reachable(client):
    r = client.get("/api/health")
    assert r.json()["services"]["clickhouse"] in {"healthy", "degraded"}
