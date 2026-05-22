"""
Multi-tenant isolation tests — verify that DEMO and ISOLATE tenants
cannot see each other's invoice data at any API layer.
"""

import pytest
from conftest import DEMO_TOTAL, ISOLATE_TOTAL

DEMO_IDS    = {f"TEST-INV-{s}" for s in [
    "F001","F002","F003","F004","F005","F006",
    "P001","P002","P003","P004",
    "U001","U002","U003","U004",
    "E001","E002","E003",
]}
ISOLATE_IDS = {"ISO-INV-001", "ISO-INV-002", "ISO-INV-003"}


def _search(client, tenant_id, size=100):
    r = client.post("/api/invoices/search", json={
        "query": "all invoices", "tenant_id": tenant_id, "page": 1, "size": size
    })
    assert r.status_code == 200
    return r.json()


# ── Search isolation ──────────────────────────────────────────────────────────

def test_demo_search_returns_only_demo_invoices(client):
    data = _search(client, "DEMO")
    for inv in data["invoices"]:
        assert inv["tenant_id"] == "DEMO", (
            f"DEMO search returned invoice from tenant {inv['tenant_id']!r}: {inv['invoice_id']}"
        )


def test_isolate_search_returns_only_isolate_invoices(client):
    data = _search(client, "ISOLATE")
    for inv in data["invoices"]:
        assert inv["tenant_id"] == "ISOLATE", (
            f"ISOLATE search returned invoice from tenant {inv['tenant_id']!r}: {inv['invoice_id']}"
        )


def test_demo_search_does_not_contain_isolate_ids(client):
    data = _search(client, "DEMO")
    returned_ids = {inv["invoice_id"] for inv in data["invoices"]}
    leaked = returned_ids & ISOLATE_IDS
    assert not leaked, f"DEMO search leaked ISOLATE invoice IDs: {leaked}"


def test_isolate_search_does_not_contain_demo_ids(client):
    data = _search(client, "ISOLATE")
    returned_ids = {inv["invoice_id"] for inv in data["invoices"]}
    leaked = returned_ids & DEMO_IDS
    assert not leaked, f"ISOLATE search leaked DEMO invoice IDs: {leaked}"


def test_demo_search_total_equals_demo_seed_count(client):
    data = _search(client, "DEMO")
    assert data["total"] == DEMO_TOTAL, (
        f"DEMO total expected {DEMO_TOTAL}, got {data['total']}"
    )


def test_isolate_search_total_equals_isolate_seed_count(client):
    data = _search(client, "ISOLATE")
    assert data["total"] == ISOLATE_TOTAL, (
        f"ISOLATE total expected {ISOLATE_TOTAL}, got {data['total']}"
    )


def test_nonexistent_tenant_returns_empty(client):
    data = _search(client, "TENANT_THAT_DOES_NOT_EXIST")
    assert data["total"] == 0
    assert data["invoices"] == []


# ── Analytics isolation ───────────────────────────────────────────────────────

def test_analytics_scoped_to_demo(client):
    r = client.get("/api/analytics")
    data = r.json()
    assert data["total_invoices"] == DEMO_TOTAL
    assert data["tenant_id"] == "DEMO"


def test_analytics_does_not_aggregate_isolate_data(client):
    r = client.get("/api/analytics")
    data = r.json()
    # ISOLATE has 1 FULLY_PAID (ISO-INV-001). If leaking, match_rate would be higher.
    # DEMO has 6 FULLY_PAID / 17 total ≈ 0.353
    expected_max = (6 + 1) / DEMO_TOTAL  # would be this if ISOLATE leaks
    expected_exact = 6 / DEMO_TOTAL
    assert abs(data["match_rate"] - expected_exact) < 0.01, (
        f"match_rate {data['match_rate']:.4f} suggests cross-tenant data leak. "
        f"Expected ~{expected_exact:.4f} (DEMO only)"
    )


# ── GET endpoint isolation (tenant from JWT defaults to DEMO) ─────────────────

def test_get_invoices_returns_demo_data_by_default(client):
    r = client.get("/api/invoices", params={"size": 100})
    assert r.status_code == 200
    data = r.json()
    for inv in data["invoices"]:
        assert inv["tenant_id"] == "DEMO", (
            f"Default GET /api/invoices returned non-DEMO invoice: {inv['invoice_id']}"
        )
