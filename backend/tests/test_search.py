"""
Search endpoint tests — validates invoice search via GET and POST,
pagination, response structure, and field completeness.
"""

import pytest
from conftest import DEMO_TOTAL, DEMO_STATUS_COUNTS

REQUIRED_FIELDS = {
    "invoice_id", "tenant_id", "merchant", "customer",
    "amount", "invoice_date", "due_date", "status",
}


# ── POST /api/invoices/search ─────────────────────────────────────────────────

def test_post_search_returns_200(client):
    r = client.post("/api/invoices/search", json={"query": "all invoices", "tenant_id": "DEMO"})
    assert r.status_code == 200


def test_post_search_response_has_required_keys(client):
    r = client.post("/api/invoices/search", json={"query": "all invoices", "tenant_id": "DEMO"})
    data = r.json()
    assert "total" in data
    assert "invoices" in data
    assert isinstance(data["invoices"], list)


def test_post_search_total_matches_seeded_count(client):
    r = client.post("/api/invoices/search", json={
        "query": "all invoices", "tenant_id": "DEMO", "page": 1, "size": 100
    })
    data = r.json()
    assert data["total"] == DEMO_TOTAL, (
        f"Expected {DEMO_TOTAL} DEMO invoices, got {data['total']}"
    )


def test_post_search_invoice_has_required_fields(client):
    r = client.post("/api/invoices/search", json={"query": "all invoices", "tenant_id": "DEMO"})
    invoices = r.json()["invoices"]
    assert len(invoices) > 0, "No invoices returned — is seed data loaded?"
    for inv in invoices:
        missing = REQUIRED_FIELDS - set(inv.keys())
        assert not missing, f"Invoice {inv.get('invoice_id')} missing fields: {missing}"


def test_post_search_all_invoices_belong_to_demo(client):
    r = client.post("/api/invoices/search", json={
        "query": "all invoices", "tenant_id": "DEMO", "page": 1, "size": 100
    })
    for inv in r.json()["invoices"]:
        assert inv["tenant_id"] == "DEMO", f"Leaked invoice from tenant {inv['tenant_id']!r}"


def test_post_search_amount_is_positive_float(client):
    r = client.post("/api/invoices/search", json={"query": "all invoices", "tenant_id": "DEMO"})
    for inv in r.json()["invoices"]:
        assert isinstance(inv["amount"], (int, float))
        assert inv["amount"] > 0, f"Non-positive amount for {inv['invoice_id']}: {inv['amount']}"


def test_post_search_status_is_valid_value(client):
    valid = {"FULLY_PAID", "PARTIALLY_PAID", "UNPAID", "ESCALATED"}
    r = client.post("/api/invoices/search", json={
        "query": "all invoices", "tenant_id": "DEMO", "page": 1, "size": 100
    })
    for inv in r.json()["invoices"]:
        assert inv["status"] in valid, f"Invalid status {inv['status']!r} for {inv['invoice_id']}"


def test_post_search_confidence_between_0_and_1(client):
    r = client.post("/api/invoices/search", json={
        "query": "all invoices", "tenant_id": "DEMO", "page": 1, "size": 100
    })
    for inv in r.json()["invoices"]:
        conf = inv.get("confidence", 0)
        assert 0.0 <= conf <= 1.0, f"Confidence out of range for {inv['invoice_id']}: {conf}"


# ── Pagination ────────────────────────────────────────────────────────────────

def test_pagination_page_size_respected(client):
    r = client.post("/api/invoices/search", json={
        "query": "all invoices", "tenant_id": "DEMO", "page": 1, "size": 5
    })
    data = r.json()
    assert len(data["invoices"]) == min(5, data["total"])


def test_pagination_page_2_returns_different_records(client):
    r1 = client.post("/api/invoices/search", json={
        "query": "all invoices", "tenant_id": "DEMO", "page": 1, "size": 5
    })
    r2 = client.post("/api/invoices/search", json={
        "query": "all invoices", "tenant_id": "DEMO", "page": 2, "size": 5
    })
    ids1 = {inv["invoice_id"] for inv in r1.json()["invoices"]}
    ids2 = {inv["invoice_id"] for inv in r2.json()["invoices"]}
    assert ids1.isdisjoint(ids2), "Page 1 and page 2 returned overlapping invoices"


def test_pagination_beyond_total_returns_empty(client):
    r = client.post("/api/invoices/search", json={
        "query": "all invoices", "tenant_id": "DEMO", "page": 999, "size": 50
    })
    assert r.json()["invoices"] == []


# ── GET /api/invoices ─────────────────────────────────────────────────────────

def test_get_invoices_returns_200(client):
    r = client.get("/api/invoices")
    assert r.status_code == 200


def test_get_invoices_default_returns_invoices(client):
    r = client.get("/api/invoices")
    data = r.json()
    assert "invoices" in data
    assert "total" in data


def test_get_invoices_with_query_param(client):
    r = client.get("/api/invoices", params={"q": "all invoices", "size": 100})
    assert r.status_code == 200
    assert r.json()["total"] >= 0


# ── Specific invoice lookup via known seed IDs ────────────────────────────────

@pytest.mark.parametrize("invoice_id,expected_status", [
    ("TEST-INV-F001", "FULLY_PAID"),
    ("TEST-INV-P001", "PARTIALLY_PAID"),
    ("TEST-INV-U001", "UNPAID"),
    ("TEST-INV-E001", "ESCALATED"),
])
def test_seeded_invoice_status_correct(client, invoice_id, expected_status):
    r = client.post("/api/invoices/search", json={
        "query": "all invoices", "tenant_id": "DEMO", "page": 1, "size": 100
    })
    invoices = {inv["invoice_id"]: inv for inv in r.json()["invoices"]}
    assert invoice_id in invoices, f"{invoice_id} not found in search results"
    assert invoices[invoice_id]["status"] == expected_status


def test_escalated_invoice_has_reasoning(client):
    r = client.post("/api/invoices/search", json={
        "query": "all invoices", "tenant_id": "DEMO", "page": 1, "size": 100
    })
    escalated = [
        inv for inv in r.json()["invoices"]
        if inv["status"] == "ESCALATED"
    ]
    assert len(escalated) == DEMO_STATUS_COUNTS["ESCALATED"]
    for inv in escalated:
        assert inv.get("reasoning"), f"Escalated invoice {inv['invoice_id']} missing reasoning"


def test_fully_paid_has_matched_payment_id(client):
    r = client.post("/api/invoices/search", json={
        "query": "all invoices", "tenant_id": "DEMO", "page": 1, "size": 100
    })
    fully_paid = [inv for inv in r.json()["invoices"] if inv["status"] == "FULLY_PAID"]
    assert len(fully_paid) == DEMO_STATUS_COUNTS["FULLY_PAID"]
    for inv in fully_paid:
        assert inv.get("matched_payment_id"), (
            f"FULLY_PAID invoice {inv['invoice_id']} missing matched_payment_id"
        )
