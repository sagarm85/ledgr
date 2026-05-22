import os, json, logging, time
from datetime import date
from kafka import KafkaConsumer, KafkaProducer
from collections import defaultdict
from elasticsearch import Elasticsearch
from clickhouse_driver import Client
from llm.client import match_invoice, MatchResult

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger(__name__)

BROKER               = os.getenv("KAFKA_BROKER", "localhost:9092")
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.75"))
ES_HOST              = os.getenv("ES_HOST", "http://localhost:9200")
ES_INDEX_PREFIX      = os.getenv("ES_INDEX_PREFIX", "invoices")
CH_HOST              = os.getenv("CH_HOST", "localhost")
CH_PORT              = int(os.getenv("CH_PORT", "9000"))
CH_DB                = os.getenv("CH_DB", "reconciliation")
BATCH_SIZE           = int(os.getenv("RECONCILE_BATCH_SIZE", "500"))
# Set SKIP_LLM=true for bulk loads — low-confidence matches become ESCALATED instantly
SKIP_LLM             = os.getenv("SKIP_LLM", "false").lower() == "true"
# Demo mode: sleep between batches so widgets animate visibly. 0 = disabled (prod default).
DEMO_SLEEP_MS        = int(os.getenv("DEMO_SLEEP_MS", "0"))

def make_producer():
    return KafkaProducer(
        bootstrap_servers=BROKER,
        value_serializer=lambda v: json.dumps(v).encode(),
        acks=1,
    )

def make_es():
    return Elasticsearch(ES_HOST)

def make_ch():
    client = Client(host=CH_HOST, port=CH_PORT, database=CH_DB)
    client.execute(f"CREATE DATABASE IF NOT EXISTS {CH_DB}")
    client.execute("""
        CREATE TABLE IF NOT EXISTS invoices_reconciled (
            invoice_id         String,
            tenant_id          String,
            merchant           String,
            customer           String,
            amount             Float64,
            invoice_date       Date,
            due_date           Date,
            status             String,
            confidence         Float32,
            matched_payment_id String,
            due_amount         Float64,
            source             String,
            inserted_at        DateTime DEFAULT now()
        ) ENGINE = ReplacingMergeTree()
        PARTITION BY toYYYYMM(invoice_date)
        ORDER BY (tenant_id, invoice_date, invoice_id)
    """)
    return client


_es_index_cache: set = set()

def _ensure_es_index(es: Elasticsearch, tenant_id: str):
    index = f"{ES_INDEX_PREFIX}-{tenant_id.lower()}"
    if index in _es_index_cache:
        return index
    try:
        es.indices.create(index=index, mappings={"properties": {
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
        }})
        log.info("Created ES index: %s", index)
    except Exception:
        pass  # index already exists
    _es_index_cache.add(index)
    return index


def flush_payments(batch: list, es: Elasticsearch):
    if not batch:
        return
    tenant_id = batch[0]["tenant_id"]
    index = f"payments-{tenant_id.lower()}"
    try:
        es.indices.create(index=index, mappings={"properties": {
            "payment_id":   {"type": "keyword"},
            "tenant_id":    {"type": "keyword"},
            "invoice_id":   {"type": "keyword"},
            "amount_paid":  {"type": "float"},
            "payment_date": {"type": "date"},
            "method":       {"type": "keyword"},
            "reference":    {"type": "keyword"},
            "source":       {"type": "keyword"},
        }})
    except Exception:
        pass
    bulk_ops = []
    for doc in batch:
        bulk_ops.append({"index": {"_index": index, "_id": doc["payment_id"]}})
        bulk_ops.append(doc)
    es.bulk(operations=bulk_ops, refresh=False)


def flush_batch(batch: list, es: Elasticsearch, ch: Client, producer: KafkaProducer):
    if not batch:
        return

    # ES bulk insert
    tenant_id = batch[0]["tenant_id"]
    index = _ensure_es_index(es, tenant_id)
    bulk_ops = []
    for doc in batch:
        bulk_ops.append({"index": {"_index": index, "_id": doc["invoice_id"]}})
        bulk_ops.append(doc)
    es.bulk(operations=bulk_ops, refresh=False)

    # ClickHouse batch insert
    ch_rows = [{
        "invoice_id":         d.get("invoice_id", ""),
        "tenant_id":          d.get("tenant_id", ""),
        "merchant":           d.get("merchant", ""),
        "customer":           d.get("customer", ""),
        "amount":             float(d.get("amount", 0)),
        "invoice_date":       date.fromisoformat(d.get("invoice_date", "2024-01-01")),
        "due_date":           date.fromisoformat(d.get("due_date", "2024-01-01")),
        "status":             d.get("status", "UNPAID"),
        "confidence":         float(d.get("confidence", 0)),
        "matched_payment_id": d.get("matched_payment_id") or "",
        "due_amount":         float(d.get("due_amount", 0)),
        "source":             d.get("source", "job"),
    } for d in batch]
    ch.execute(
        "INSERT INTO invoices_reconciled (invoice_id, tenant_id, merchant, customer, amount, "
        "invoice_date, due_date, status, confidence, matched_payment_id, due_amount, source) VALUES",
        ch_rows
    )

    # Kafka sink topic
    for doc in batch:
        producer.send("reconciled-invoices", value=doc)
    producer.flush()

    log.info("Flushed %d reconciled invoices → ES + ClickHouse + Kafka", len(batch))


def reconcile(invoice: dict, payments_by_invoice: dict) -> dict:
    invoice_id = invoice["invoice_id"]
    candidates = payments_by_invoice.get(invoice_id, [])

    for pay in candidates:
        if pay.get("reference") == invoice_id and pay["amount_paid"] >= invoice["amount"] * 0.99:
            return {**invoice, "status": "FULLY_PAID", "confidence": 1.0,
                    "matched_payment_id": pay["payment_id"], "due_amount": 0.0}
        if pay.get("reference") == invoice_id and pay["amount_paid"] >= invoice["amount"] * 0.5:
            due = round(invoice["amount"] - pay["amount_paid"], 2)
            return {**invoice, "status": "PARTIALLY_PAID", "confidence": 0.9,
                    "matched_payment_id": pay["payment_id"], "due_amount": due}

    if candidates:
        if SKIP_LLM:
            # bulk mode: no LLM call — flag for later review
            return {**invoice, "status": "ESCALATED", "confidence": 0.5,
                    "matched_payment_id": None, "due_amount": invoice["amount"],
                    "reasoning": "skipped-llm-bulk-load"}
        result: MatchResult = match_invoice(invoice, candidates[:5])
        status = ("FULLY_PAID"     if result.confidence >= 0.9 else
                  "PARTIALLY_PAID" if result.confidence >= CONFIDENCE_THRESHOLD else
                  "ESCALATED")
        return {**invoice, "status": status, "confidence": result.confidence,
                "matched_payment_id": result.matched_payment_id,
                "due_amount": result.due_amount, "reasoning": result.reasoning}

    return {**invoice, "status": "UNPAID", "confidence": 0.0,
            "matched_payment_id": None, "due_amount": invoice["amount"]}


def run():
    producer = make_producer()
    es       = make_es()
    ch       = make_ch()
    payments_by_invoice: dict = defaultdict(list)
    invoice_buffer:  list = []
    result_batch:    list = []
    payments_buffer: list = []
    total_flushed = 0

    consumer = KafkaConsumer(
        "invoices-raw", "payments-raw",
        bootstrap_servers=BROKER,
        value_deserializer=lambda b: json.loads(b.decode()),
        group_id="reconciliation-job-v2",
        auto_offset_reset="earliest",
        enable_auto_commit=True,
        session_timeout_ms=60000,
        heartbeat_interval_ms=20000,
        max_poll_interval_ms=600000,
        fetch_max_bytes=52428800,
        max_partition_fetch_bytes=10485760,
    )

    log.info("Reconciliation job started — writing to ES + ClickHouse + Kafka")
    for msg in consumer:
        data  = msg.value
        topic = msg.topic

        if topic == "payments-raw":
            inv_id = data.get("invoice_id") or data.get("reference")
            if inv_id:
                payments_by_invoice[inv_id].append(data)
            payments_buffer.append(data)
            if len(payments_buffer) >= BATCH_SIZE:
                flush_payments(payments_buffer, es)
                payments_buffer.clear()

        elif topic == "invoices-raw":
            invoice_buffer.append(data)
            if len(invoice_buffer) >= BATCH_SIZE:
                for inv in invoice_buffer:
                    result_batch.append(reconcile(inv, payments_by_invoice))
                invoice_buffer.clear()

                flush_batch(result_batch, es, ch, producer)
                total_flushed += len(result_batch)
                log.info("Total reconciled so far: %d", total_flushed)
                result_batch.clear()
                if DEMO_SLEEP_MS:
                    time.sleep(DEMO_SLEEP_MS / 1000)


if __name__ == "__main__":
    run()
