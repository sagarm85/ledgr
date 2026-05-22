"""One-shot job: reads payments-raw from Kafka offset 0 and bulk-indexes to ES payments-{tenant} index."""
import os, json, logging
from kafka import KafkaConsumer, TopicPartition
from elasticsearch import Elasticsearch

logging.basicConfig(level="INFO", format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)

BROKER          = os.getenv("KAFKA_BROKER", "localhost:9092")
ES_HOST         = os.getenv("ES_HOST", "http://localhost:9200")
ES_INDEX_PREFIX = os.getenv("ES_INDEX_PREFIX", "invoices")
BATCH_SIZE      = 1000

es = Elasticsearch(ES_HOST)

def ensure_index(tenant_id: str):
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
        pass  # already exists
    return index

def flush(batch: list):
    if not batch:
        return
    index = ensure_index(batch[0]["tenant_id"])
    ops = []
    for doc in batch:
        ops.append({"index": {"_index": index, "_id": doc["payment_id"]}})
        ops.append(doc)
    es.bulk(operations=ops, refresh=False)
    log.info("Indexed %d payments → %s", len(batch), index)

consumer = KafkaConsumer(
    "payments-raw",
    bootstrap_servers=BROKER,
    value_deserializer=lambda b: json.loads(b.decode()),
    group_id="payments-indexer-v1",
    auto_offset_reset="earliest",
    enable_auto_commit=True,
    session_timeout_ms=30000,
    consumer_timeout_ms=10000,   # stop after 10s of no new messages
)

batch = []
total = 0
log.info("Starting payments indexer…")
for msg in consumer:
    batch.append(msg.value)
    if len(batch) >= BATCH_SIZE:
        flush(batch)
        total += len(batch)
        log.info("Total indexed: %d", total)
        batch.clear()

flush(batch)
total += len(batch)
log.info("Done. Total payments indexed: %d", total)
consumer.close()
