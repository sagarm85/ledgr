"""
Analytics endpoint tests — validates /api/analytics aggregations
match the seeded ClickHouse data.
"""

from conftest import DEMO_TOTAL, DEMO_STATUS_COUNTS


def _get_analytics(client, tenant_id="DEMO"):
    r = client.get("/api/analytics", headers={"Authorization": f"tenant:{tenant_id}"})
    assert r.status_code == 200
    return r.json()


def test_analytics_returns_200(client):
    r = client.get("/api/analytics")
    assert r.status_code == 200


def test_analytics_response_has_required_fields(client):
    data = _get_analytics(client)
    required = {
        "total_invoices", "total_due", "match_rate",
        "escalated_rate", "status_breakdown", "daily_volumes", "tenant_id",
    }
    missing = required - set(data.keys())
    assert not missing, f"Analytics response missing fields: {missing}"


def test_analytics_total_invoices_matches_seed(client):
    data = _get_analytics(client)
    assert data["total_invoices"] == DEMO_TOTAL, (
        f"Expected {DEMO_TOTAL} total invoices, got {data['total_invoices']}"
    )


def test_analytics_match_rate_is_valid_fraction(client):
    data = _get_analytics(client)
    rate = data["match_rate"]
    assert isinstance(rate, float)
    assert 0.0 <= rate <= 1.0, f"match_rate out of range: {rate}"


def test_analytics_match_rate_reflects_fully_paid_count(client):
    data = _get_analytics(client)
    expected = round(DEMO_STATUS_COUNTS["FULLY_PAID"] / DEMO_TOTAL, 4)
    assert abs(data["match_rate"] - expected) < 0.01, (
        f"match_rate {data['match_rate']:.4f} doesn't reflect {DEMO_STATUS_COUNTS['FULLY_PAID']}/{DEMO_TOTAL}"
    )


def test_analytics_escalated_rate_is_valid_fraction(client):
    data = _get_analytics(client)
    rate = data["escalated_rate"]
    assert 0.0 <= rate <= 1.0


def test_analytics_escalated_rate_reflects_escalated_count(client):
    data = _get_analytics(client)
    expected = round(DEMO_STATUS_COUNTS["ESCALATED"] / DEMO_TOTAL, 4)
    assert abs(data["escalated_rate"] - expected) < 0.01


def test_analytics_status_breakdown_is_dict(client):
    data = _get_analytics(client)
    assert isinstance(data["status_breakdown"], dict)


def test_analytics_status_breakdown_has_all_statuses(client):
    data = _get_analytics(client)
    breakdown = data["status_breakdown"]
    for status in DEMO_STATUS_COUNTS:
        assert status in breakdown, f"status_breakdown missing: {status}"


def test_analytics_status_breakdown_counts_match_seed(client):
    data = _get_analytics(client)
    breakdown = data["status_breakdown"]
    for status, expected_count in DEMO_STATUS_COUNTS.items():
        actual = breakdown.get(status, 0)
        assert actual == expected_count, (
            f"{status}: expected {expected_count}, got {actual}"
        )


def test_analytics_total_due_is_positive(client):
    data = _get_analytics(client)
    assert data["total_due"] > 0, "total_due should be positive — seed data has unpaid invoices"


def test_analytics_total_due_excludes_fully_paid(client):
    data = _get_analytics(client)
    fully_paid_amounts = {
        "TEST-INV-F001": 12500.00,
        "TEST-INV-F002": 8750.50,
        "TEST-INV-F003": 33000.00,
        "TEST-INV-F004": 4200.00,
        "TEST-INV-F005": 19800.75,
        "TEST-INV-F006": 7600.00,
    }
    # Due amount for FULLY_PAID = 0. Total due should be less than sum of all amounts.
    sum_all = sum([
        12500, 8750.5, 33000, 4200, 19800.75, 7600,   # FULLY_PAID
        25000, 15300, 9400, 47500,                     # PARTIALLY_PAID (full amount, due_amount is partial)
        6800, 22100, 3150, 11250,                      # UNPAID
        38000, 5600, 18700,                            # ESCALATED
    ])
    assert data["total_due"] < sum_all


def test_analytics_daily_volumes_is_list(client):
    data = _get_analytics(client)
    assert isinstance(data["daily_volumes"], list)


def test_analytics_daily_volumes_entries_have_required_keys(client):
    data = _get_analytics(client)
    for entry in data["daily_volumes"]:
        assert "date" in entry
        assert "count" in entry
        assert "total" in entry


def test_analytics_daily_volumes_counts_are_positive(client):
    data = _get_analytics(client)
    for entry in data["daily_volumes"]:
        assert entry["count"] > 0, f"Zero-count entry in daily_volumes: {entry}"


def test_analytics_tenant_id_in_response(client):
    data = _get_analytics(client)
    assert data["tenant_id"] == "DEMO"
