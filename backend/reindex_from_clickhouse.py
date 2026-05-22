"""Re-index invoices_reconciled from ClickHouse → Elasticsearch with correct mappings."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from elasticsearch import Elasticsearch
from clickhouse_driver import Client

ES_HOST = os.getenv("ES_HOST", "http://localhost:9200")
CH_HOST = os.getenv("CH_HOST", "localhost")
CH_PORT = int(os.getenv("CH_PORT", "9000"))
CH_DB   = os.getenv("CH_DB", "reconciliation")

MAPPING = {
    "mappings": {
        "properties": {
            "invoice_id":         {"type": "keyword"},
            "tenant_id":          {"type": "keyword"},
            "merchant":           {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
            "customer":           {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
            "amount":             {"type": "float"},
            "invoice_date":       {"type": "date"},
            "due_date":           {"type": "date"},
            "status":             {"type": "keyword"},
            "confidence":         {"type": "float"},
            "matched_payment_id": {"type": "keyword"},
            "due_amount":         {"type": "float"},
            "reasoning":          {"type": "text"},
            "source":             {"type": "keyword"},
        }
    }
}

def run():
    es = Elasticsearch(ES_HOST)
    ch = Client(host=CH_HOST, port=CH_PORT, database=CH_DB)

    rows = ch.execute(
        "SELECT invoice_id, tenant_id, merchant, customer, amount, "
        "toString(invoice_date), toString(due_date), status, confidence, "
        "matched_payment_id, due_amount, source, reasoning "
        "FROM invoices_reconciled ORDER BY tenant_id, invoice_id"
    )
    print(f"Fetched {len(rows):,} rows from ClickHouse")

    tenants = {r[1] for r in rows}
    for tenant in tenants:
        index = f"invoices-{tenant.lower()}"
        try:
            es.indices.create(index=index, body=MAPPING)
            print(f"Created index: {index}")
        except Exception:
            pass  # already exists

    batch, total = [], 0
    for row in rows:
        invoice_id, tenant_id, merchant, customer, amount, invoice_date, due_date, \
            status, confidence, matched_payment_id, due_amount, source, reasoning = row
        index = f"invoices-{tenant_id.lower()}"
        batch.append({"index": {"_index": index, "_id": invoice_id}})
        batch.append({
            "invoice_id": invoice_id, "tenant_id": tenant_id,
            "merchant": merchant, "customer": customer,
            "amount": float(amount), "invoice_date": invoice_date,
            "due_date": due_date, "status": status,
            "confidence": float(confidence),
            "matched_payment_id": matched_payment_id or None,
            "due_amount": float(due_amount), "source": source,
            "reasoning": reasoning or None,
        })
        if len(batch) >= 1000:
            es.bulk(operations=batch, refresh=False)
            total += len(batch) // 2
            print(f"  Indexed {total:,}…")
            batch = []

    if batch:
        es.bulk(operations=batch, refresh=False)
        total += len(batch) // 2

    es.indices.refresh(index="_all")
    print(f"Done — {total:,} documents indexed")

if __name__ == "__main__":
    run()
