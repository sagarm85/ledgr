"""
Fast bulk rematch: loads all payments into memory, then matches UNPAID invoices
in ES batches. Runs in ~2-5 minutes for 1M invoices vs hours via the API.
"""
import os, logging
from elasticsearch import Elasticsearch
import clickhouse_driver

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(message)s")
log = logging.getLogger(__name__)

ES_HOST  = os.getenv("ES_HOST",  "http://elasticsearch:9200")
CH_HOST  = os.getenv("CH_HOST",  "clickhouse")
CH_PORT  = int(os.getenv("CH_PORT", "9000"))
TENANT   = os.getenv("TENANT",   "DEMO")

INV_INDEX = f"invoices-{TENANT.lower()}"
PAY_INDEX = f"payments-{TENANT.lower()}"

es = Elasticsearch(ES_HOST)
ch = clickhouse_driver.Client(host=CH_HOST, port=CH_PORT)


def scroll_index(index: str, query: dict, sort_field: str, batch=5000):
    """PIT + search_after pagination using a keyword sort field."""
    pit = es.open_point_in_time(index=index, keep_alive="10m")["id"]
    after = None
    while True:
        body = {
            **query,
            "size": batch,
            "sort": [{sort_field: "asc"}],
            "pit": {"id": pit, "keep_alive": "10m"},
        }
        if after:
            body["search_after"] = after
        r    = es.search(body=body)
        hits = r["hits"]["hits"]
        if not hits:
            break
        yield hits
        after = hits[-1]["sort"]
        pit   = r.get("pit_id", pit)
        if len(hits) < batch:
            break
    es.close_point_in_time(body={"id": pit})


def load_payments() -> dict:
    log.info("Loading payments from %s ...", PAY_INDEX)
    payments_map: dict = {}
    query = {"query": {"term": {"tenant_id": TENANT}}}
    for batch in scroll_index(PAY_INDEX, query, "payment_id"):
        for h in batch:
            p      = h["_source"]
            inv_id = p.get("invoice_id")
            if inv_id:
                payments_map[inv_id] = p
        log.info("  Loaded %d payments ...", len(payments_map))
    log.info("Total payments in memory: %d", len(payments_map))
    return payments_map


def build_update(inv: dict, pay: dict) -> dict:
    amount = float(inv.get("amount", 0))
    paid   = float(pay.get("amount_paid", 0))
    pct    = paid / amount if amount > 0 else 0
    status = "FULLY_PAID" if pct >= 0.99 else "PARTIALLY_PAID"
    due    = max(0.0, round(amount - paid, 2))
    return {
        "status":             status,
        "confidence":         0.95,
        "matched_payment_id": pay["payment_id"],
        "due_amount":         due,
        "reasoning":          "Direct match via invoice_id reference",
    }


def flush_es(ops: list):
    if ops:
        es.bulk(operations=ops, refresh=False)


def run():
    payments_map = load_payments()

    total_seen = total_matched = 0
    es_ops: list = []

    query = {"query": {"bool": {"must": [
        {"term": {"tenant_id": TENANT}},
        {"term": {"status":    "UNPAID"}},
    ]}}}

    log.info("Processing UNPAID invoices ...")
    for batch in scroll_index(INV_INDEX, query, "invoice_id"):
        for h in batch:
            inv = h["_source"]
            total_seen += 1
            pay = payments_map.get(inv.get("invoice_id", ""))
            if not pay:
                continue
            total_matched += 1
            update = build_update(inv, pay)
            es_ops.append({"update": {"_index": INV_INDEX, "_id": h["_id"]}})
            es_ops.append({"doc": update})

        if len(es_ops) >= 10_000:
            flush_es(es_ops)
            es_ops = []
            log.info("  Matched %d / %d so far ...", total_matched, total_seen)

    flush_es(es_ops)

    es.indices.refresh(index=INV_INDEX)
    log.info("Done. Processed %d UNPAID invoices, matched %d (%.1f%%)",
             total_seen, total_matched,
             100.0 * total_matched / max(total_seen, 1))


if __name__ == "__main__":
    run()
