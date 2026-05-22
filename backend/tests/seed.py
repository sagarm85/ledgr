"""
Dummy data seeder — inserts test invoices directly into
Elasticsearch and ClickHouse without going through Kafka.

Run standalone: python backend/tests/seed.py
Or called automatically by conftest.py fixtures.
"""

import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from elasticsearch import Elasticsearch
from clickhouse_driver import Client as CHClient

ES_HOST  = os.getenv("ES_HOST", "http://localhost:9200")
CH_HOST  = os.getenv("CH_HOST", "localhost")
CH_PORT  = int(os.getenv("CH_PORT", "9000"))
CH_DB    = os.getenv("CH_DB", "reconciliation")

today = date.today()
d = lambda n: (today - timedelta(days=n)).isoformat()
due = lambda n: (today + timedelta(days=n)).isoformat()

# ── DEMO tenant — 17 invoices across all 4 statuses ─────────────────────────

DEMO_INVOICES = [
    # FULLY_PAID × 6 — high confidence, matched payments
    {
        "invoice_id": "TEST-INV-F001", "tenant_id": "DEMO",
        "merchant": "Acme Software Ltd", "customer": "TechCorp Solutions",
        "amount": 12500.00, "invoice_date": d(2), "due_date": due(28),
        "status": "FULLY_PAID", "confidence": 0.97,
        "matched_payment_id": "TEST-PAY-F001", "due_amount": 0.0,
        "reasoning": "Exact match: payment reference equals invoice ID, amount matches.",
        "source": "test",
    },
    {
        "invoice_id": "TEST-INV-F002", "tenant_id": "DEMO",
        "merchant": "Vertex Analytics", "customer": "NovaPay Inc",
        "amount": 8750.50, "invoice_date": d(5), "due_date": due(25),
        "status": "FULLY_PAID", "confidence": 0.95,
        "matched_payment_id": "TEST-PAY-F002", "due_amount": 0.0,
        "reasoning": "Payment amount matches exactly, date is 3 days after invoice.",
        "source": "test",
    },
    {
        "invoice_id": "TEST-INV-F003", "tenant_id": "DEMO",
        "merchant": "GlobalTech Services", "customer": "BrightPath Ltd",
        "amount": 33000.00, "invoice_date": d(8), "due_date": due(22),
        "status": "FULLY_PAID", "confidence": 0.93,
        "matched_payment_id": "TEST-PAY-F003", "due_amount": 0.0,
        "reasoning": "Bank transfer reference includes invoice number.",
        "source": "test",
    },
    {
        "invoice_id": "TEST-INV-F004", "tenant_id": "DEMO",
        "merchant": "Sunrise Media", "customer": "Orion Enterprises",
        "amount": 4200.00, "invoice_date": d(12), "due_date": due(18),
        "status": "FULLY_PAID", "confidence": 0.91,
        "matched_payment_id": "TEST-PAY-F004", "due_amount": 0.0,
        "reasoning": "ACH payment with matching amount and reference ID.",
        "source": "test",
    },
    {
        "invoice_id": "TEST-INV-F005", "tenant_id": "DEMO",
        "merchant": "Pinnacle Consulting", "customer": "DataStream Corp",
        "amount": 19800.75, "invoice_date": d(17), "due_date": due(13),
        "status": "FULLY_PAID", "confidence": 0.96,
        "matched_payment_id": "TEST-PAY-F005", "due_amount": 0.0,
        "reasoning": "Credit card payment matches invoice to the cent.",
        "source": "test",
    },
    {
        "invoice_id": "TEST-INV-F006", "tenant_id": "DEMO",
        "merchant": "Quantum Logistics", "customer": "BlueSky Holdings",
        "amount": 7600.00, "invoice_date": d(21), "due_date": due(9),
        "status": "FULLY_PAID", "confidence": 0.90,
        "matched_payment_id": "TEST-PAY-F006", "due_amount": 0.0,
        "reasoning": "Wire transfer reference matches. Amount confirmed.",
        "source": "test",
    },
    # PARTIALLY_PAID × 4 — medium confidence, partial amounts
    {
        "invoice_id": "TEST-INV-P001", "tenant_id": "DEMO",
        "merchant": "Nexus Engineering", "customer": "FutureTech GmbH",
        "amount": 25000.00, "invoice_date": d(4), "due_date": due(26),
        "status": "PARTIALLY_PAID", "confidence": 0.72,
        "matched_payment_id": "TEST-PAY-P001", "due_amount": 12500.00,
        "reasoning": "Payment covers 50% of invoice. Possible installment plan.",
        "source": "test",
    },
    {
        "invoice_id": "TEST-INV-P002", "tenant_id": "DEMO",
        "merchant": "Apex Freight", "customer": "Ironwood Industries",
        "amount": 15300.00, "invoice_date": d(9), "due_date": due(21),
        "status": "PARTIALLY_PAID", "confidence": 0.68,
        "matched_payment_id": "TEST-PAY-P002", "due_amount": 6120.00,
        "reasoning": "Payment is 60% of billed amount. Dispute likely on remainder.",
        "source": "test",
    },
    {
        "invoice_id": "TEST-INV-P003", "tenant_id": "DEMO",
        "merchant": "Strata Cloud", "customer": "Meridian Corp",
        "amount": 9400.00, "invoice_date": d(14), "due_date": due(16),
        "status": "PARTIALLY_PAID", "confidence": 0.71,
        "matched_payment_id": "TEST-PAY-P003", "due_amount": 2820.00,
        "reasoning": "Payment of $6,580 received — 70% of invoice value.",
        "source": "test",
    },
    {
        "invoice_id": "TEST-INV-P004", "tenant_id": "DEMO",
        "merchant": "Vector Systems", "customer": "Polaris Group",
        "amount": 47500.00, "invoice_date": d(19), "due_date": due(11),
        "status": "PARTIALLY_PAID", "confidence": 0.65,
        "matched_payment_id": "TEST-PAY-P004", "due_amount": 23750.00,
        "reasoning": "Two partial payments totalling 50% received so far.",
        "source": "test",
    },
    # UNPAID × 4 — no matched payment
    {
        "invoice_id": "TEST-INV-U001", "tenant_id": "DEMO",
        "merchant": "Solarix Power", "customer": "Helix Networks",
        "amount": 6800.00, "invoice_date": d(3), "due_date": due(27),
        "status": "UNPAID", "confidence": 0.0,
        "matched_payment_id": None, "due_amount": 6800.00,
        "reasoning": None, "source": "test",
    },
    {
        "invoice_id": "TEST-INV-U002", "tenant_id": "DEMO",
        "merchant": "Crest Capital", "customer": "Zenith Retail",
        "amount": 22100.00, "invoice_date": d(7), "due_date": due(23),
        "status": "UNPAID", "confidence": 0.0,
        "matched_payment_id": None, "due_amount": 22100.00,
        "reasoning": None, "source": "test",
    },
    {
        "invoice_id": "TEST-INV-U003", "tenant_id": "DEMO",
        "merchant": "Titan Hardware", "customer": "Summit Solutions",
        "amount": 3150.00, "invoice_date": d(13), "due_date": due(17),
        "status": "UNPAID", "confidence": 0.0,
        "matched_payment_id": None, "due_amount": 3150.00,
        "reasoning": None, "source": "test",
    },
    {
        "invoice_id": "TEST-INV-U004", "tenant_id": "DEMO",
        "merchant": "Lumina Digital", "customer": "Cascade Media",
        "amount": 11250.00, "invoice_date": d(22), "due_date": due(8),
        "status": "UNPAID", "confidence": 0.0,
        "matched_payment_id": None, "due_amount": 11250.00,
        "reasoning": None, "source": "test",
    },
    # ESCALATED × 3 — low confidence, routed to Ollama
    {
        "invoice_id": "TEST-INV-E001", "tenant_id": "DEMO",
        "merchant": "Omni Logistics", "customer": "Vega Partners",
        "amount": 38000.00, "invoice_date": d(6), "due_date": due(24),
        "status": "ESCALATED", "confidence": 0.41,
        "matched_payment_id": "TEST-PAY-E001", "due_amount": 38000.00,
        "reasoning": "Candidate payment found but customer name mismatch. Escalated for review.",
        "source": "test",
    },
    {
        "invoice_id": "TEST-INV-E002", "tenant_id": "DEMO",
        "merchant": "Cobalt Tech", "customer": "Redline Industries",
        "amount": 5600.00, "invoice_date": d(11), "due_date": due(19),
        "status": "ESCALATED", "confidence": 0.35,
        "matched_payment_id": None, "due_amount": 5600.00,
        "reasoning": "Multiple weak payment candidates — amount within 40%, no reference match.",
        "source": "test",
    },
    {
        "invoice_id": "TEST-INV-E003", "tenant_id": "DEMO",
        "merchant": "Ferro Dynamics", "customer": "Nimbus Corp",
        "amount": 18700.00, "invoice_date": d(16), "due_date": due(14),
        "status": "ESCALATED", "confidence": 0.48,
        "matched_payment_id": "TEST-PAY-E003", "due_amount": 18700.00,
        "reasoning": "Payment date predates invoice — possible prepayment. Human review needed.",
        "source": "test",
    },
]

# ── ISOLATE tenant — 3 invoices for cross-tenant isolation tests ─────────────

ISOLATE_INVOICES = [
    {
        "invoice_id": "ISO-INV-001", "tenant_id": "ISOLATE",
        "merchant": "Shadow Corp", "customer": "Ghost Client A",
        "amount": 99999.99, "invoice_date": d(1), "due_date": due(29),
        "status": "FULLY_PAID", "confidence": 0.99,
        "matched_payment_id": "ISO-PAY-001", "due_amount": 0.0,
        "reasoning": "Perfect match.", "source": "test",
    },
    {
        "invoice_id": "ISO-INV-002", "tenant_id": "ISOLATE",
        "merchant": "Shadow Corp", "customer": "Ghost Client B",
        "amount": 50000.00, "invoice_date": d(3), "due_date": due(27),
        "status": "UNPAID", "confidence": 0.0,
        "matched_payment_id": None, "due_amount": 50000.00,
        "reasoning": None, "source": "test",
    },
    {
        "invoice_id": "ISO-INV-003", "tenant_id": "ISOLATE",
        "merchant": "Shadow Corp", "customer": "Ghost Client C",
        "amount": 75000.00, "invoice_date": d(6), "due_date": due(24),
        "status": "PARTIALLY_PAID", "confidence": 0.60,
        "matched_payment_id": "ISO-PAY-003", "due_amount": 37500.00,
        "reasoning": "Partial match.", "source": "test",
    },
]

ALL_INVOICES = DEMO_INVOICES + ISOLATE_INVOICES

# ── Payments — full details for matched + multiple candidates for escalated ────

def _pay(payment_id, invoice_id, amount, days_after_invoice, method, reference="", note=None, kafka_offset=None):
    inv = next((i for i in ALL_INVOICES if i["invoice_id"] == invoice_id), None)
    inv_days = int(inv["invoice_date"].split("-")[2]) if inv else 0
    from datetime import date, timedelta
    pay_date = (today - timedelta(days=max(0, int(invoice_id[-3:]) if invoice_id[-3:].isdigit() else 5) - days_after_invoice)).isoformat()
    raw = {
        "payment_id": payment_id, "tenant_id": "DEMO", "invoice_id": invoice_id,
        "amount_paid": amount, "payment_date": pay_date,
        "method": method, "reference": reference or invoice_id, "source": "test",
    }
    return {**raw, "raw_kafka_payload": raw, "candidate_note": note}

DEMO_PAYMENTS = [
    # FULLY_PAID — exact matches
    _pay("TEST-PAY-F001", "TEST-INV-F001", 12500.00, 3,  "BANK_TRANSFER", "TEST-INV-F001"),
    _pay("TEST-PAY-F002", "TEST-INV-F002",  8750.50, 3,  "CREDIT_CARD",   "TEST-INV-F002"),
    _pay("TEST-PAY-F003", "TEST-INV-F003", 33000.00, 5,  "BANK_TRANSFER", "REF-BT-F003-INV"),
    _pay("TEST-PAY-F004", "TEST-INV-F004",  4200.00, 7,  "ACH",           "TEST-INV-F004"),
    _pay("TEST-PAY-F005", "TEST-INV-F005", 19800.75, 4,  "CREDIT_CARD",   "TEST-INV-F005"),
    _pay("TEST-PAY-F006", "TEST-INV-F006",  7600.00, 6,  "BANK_TRANSFER", "WIRE-F006"),
    # PARTIALLY_PAID — partial amounts
    _pay("TEST-PAY-P001", "TEST-INV-P001", 12500.00, 10, "BANK_TRANSFER", "TEST-INV-P001", "First instalment — 50%"),
    _pay("TEST-PAY-P002", "TEST-INV-P002",  9180.00, 8,  "ACH",           "TEST-INV-P002", "60% received, dispute on remainder"),
    _pay("TEST-PAY-P003", "TEST-INV-P003",  6580.00, 12, "CREDIT_CARD",   "TEST-INV-P003", "70% paid — $2,820 outstanding"),
    _pay("TEST-PAY-P004", "TEST-INV-P004", 23750.00, 14, "BANK_TRANSFER", "TEST-INV-P004", "50% — second instalment pending"),
    # ESCALATED E001 — customer name mismatch candidates
    _pay("TEST-PAY-E001", "TEST-INV-E001", 36500.00, 4, "BANK_TRANSFER", "REF-2024-0389",
         "Amount 3.9% under invoice. Customer listed as 'Vega Systems' — mismatch with 'Vega Partners'."),
    _pay("TEST-PAY-E001-C2", "TEST-INV-E001", 38000.00, 9, "CREDIT_CARD", "",
         "Exact amount but no reference and different account holder."),
    # ESCALATED E002 — multiple weak candidates, no strong match
    _pay("TEST-PAY-E002-C1", "TEST-INV-E002", 3200.00, 6, "ACH", "PAY-REF-20240412",
         "57% of invoice amount. No reference match."),
    _pay("TEST-PAY-E002-C2", "TEST-INV-E002", 2800.00, 8, "CREDIT_CARD", "",
         "50% of invoice amount. Possibly unrelated payment."),
    _pay("TEST-PAY-E002-C3", "TEST-INV-E002", 5400.00, 3, "BANK_TRANSFER", "INV-COBALT-NOV",
         "96% of invoice — amount close but reference does not match invoice ID."),
    # ESCALATED E003 — payment date predates invoice
    _pay("TEST-PAY-E003", "TEST-INV-E003", 18700.00, -5, "BANK_TRANSFER", "TEST-INV-E003",
         "Exact amount and reference but payment_date is 5 days BEFORE invoice_date — possible prepayment."),
    _pay("TEST-PAY-E003-C2", "TEST-INV-E003", 18700.00, 2, "ACH", "",
         "Exact amount, correct date, but no reference ID provided."),
]


# ── Elasticsearch ─────────────────────────────────────────────────────────────

INDEX_MAPPING = {
    "mappings": {
        "properties": {
            "invoice_id":          {"type": "keyword"},
            "tenant_id":           {"type": "keyword"},
            "merchant":            {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
            "customer":            {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
            "amount":              {"type": "float"},
            "invoice_date":        {"type": "date"},
            "due_date":            {"type": "date"},
            "status":              {"type": "keyword"},
            "confidence":          {"type": "float"},
            "matched_payment_id":  {"type": "keyword"},
            "due_amount":          {"type": "float"},
            "reasoning":           {"type": "text"},
            "source":              {"type": "keyword"},
        }
    }
}


def _es_index(tenant_id: str) -> str:
    return f"invoices-{tenant_id.lower()}"


PAYMENTS_MAPPING = {
    "mappings": {
        "properties": {
            "payment_id":        {"type": "keyword"},
            "tenant_id":         {"type": "keyword"},
            "invoice_id":        {"type": "keyword"},
            "amount_paid":       {"type": "float"},
            "payment_date":      {"type": "date"},
            "method":            {"type": "keyword"},
            "reference":         {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
            "source":            {"type": "keyword"},
            "raw_kafka_payload": {"type": "object", "enabled": False},
            "candidate_note":    {"type": "text"},
        }
    }
}

def seed_elasticsearch():
    es = Elasticsearch(ES_HOST)
    tenants = {inv["tenant_id"] for inv in ALL_INVOICES}
    for tenant in tenants:
        index = _es_index(tenant)
        if not es.indices.exists(index=index):
            es.indices.create(index=index, body=INDEX_MAPPING)
    for inv in ALL_INVOICES:
        es.index(
            index=_es_index(inv["tenant_id"]),
            id=inv["invoice_id"],
            document=inv,
            refresh="wait_for",
        )
    print(f"[seed] ES: inserted {len(ALL_INVOICES)} invoices across {len(tenants)} tenants")

def seed_payments_elasticsearch():
    es = Elasticsearch(ES_HOST)
    pay_index = "payments-demo"
    if not es.indices.exists(index=pay_index):
        es.indices.create(index=pay_index, body=PAYMENTS_MAPPING)
    for pay in DEMO_PAYMENTS:
        es.index(index=pay_index, id=pay["payment_id"], document=pay, refresh="wait_for")
    print(f"[seed] ES: inserted {len(DEMO_PAYMENTS)} payments into {pay_index}")


def cleanup_elasticsearch():
    es = Elasticsearch(ES_HOST)
    for inv in ALL_INVOICES:
        index = _es_index(inv["tenant_id"])
        try:
            es.delete(index=index, id=inv["invoice_id"], refresh="wait_for", ignore=[404])
        except Exception:
            pass
    print(f"[seed] ES: cleaned up {len(ALL_INVOICES)} test invoices")


# ── ClickHouse ────────────────────────────────────────────────────────────────

CREATE_DB_SQL   = f"CREATE DATABASE IF NOT EXISTS {CH_DB}"
CREATE_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {CH_DB}.invoices_reconciled (
    invoice_id        String,
    tenant_id         String,
    merchant          String,
    customer          String,
    amount            Float64,
    invoice_date      Date,
    due_date          Date,
    status            String,
    confidence        Float32,
    matched_payment_id String,
    due_amount        Float64,
    source            String,
    inserted_at       DateTime DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(invoice_date)
ORDER BY (tenant_id, invoice_date, invoice_id)
"""


def _parse_date(s: str):
    from datetime import date as _date
    y, m, d_ = s.split("-")
    return _date(int(y), int(m), int(d_))

def _ch_row(inv: dict) -> dict:
    return {
        "invoice_id":          inv["invoice_id"],
        "tenant_id":           inv["tenant_id"],
        "merchant":            inv["merchant"],
        "customer":            inv["customer"],
        "amount":              float(inv["amount"]),
        "invoice_date":        _parse_date(inv["invoice_date"]),
        "due_date":            _parse_date(inv["due_date"]),
        "status":              inv["status"],
        "confidence":          float(inv["confidence"]),
        "matched_payment_id":  inv.get("matched_payment_id") or "",
        "due_amount":          float(inv.get("due_amount") or 0),
        "source":              inv.get("source", "test"),
    }


def seed_clickhouse():
    ch = CHClient(host=CH_HOST, port=CH_PORT)
    ch.execute(CREATE_DB_SQL)
    ch.execute(CREATE_TABLE_SQL)

    ids = [inv["invoice_id"] for inv in ALL_INVOICES]
    if ids:
        placeholders = ", ".join(f"'{i}'" for i in ids)
        ch.execute(
            f"ALTER TABLE {CH_DB}.invoices_reconciled DELETE "
            f"WHERE invoice_id IN ({placeholders})"
        )

    rows = [_ch_row(inv) for inv in ALL_INVOICES]
    ch.execute(
        f"INSERT INTO {CH_DB}.invoices_reconciled "
        f"(invoice_id, tenant_id, merchant, customer, amount, invoice_date, due_date, "
        f"status, confidence, matched_payment_id, due_amount, source) VALUES",
        rows,
    )
    print(f"[seed] ClickHouse: inserted {len(rows)} rows")


def cleanup_clickhouse():
    ch = CHClient(host=CH_HOST, port=CH_PORT)
    ids = [inv["invoice_id"] for inv in ALL_INVOICES]
    if ids:
        placeholders = ", ".join(f"'{i}'" for i in ids)
        ch.execute(
            f"ALTER TABLE {CH_DB}.invoices_reconciled DELETE "
            f"WHERE invoice_id IN ({placeholders})"
        )
    print(f"[seed] ClickHouse: cleaned up {len(ids)} test rows")


if __name__ == "__main__":
    seed_elasticsearch()
    seed_payments_elasticsearch()
    seed_clickhouse()
    print("Seed complete.")
