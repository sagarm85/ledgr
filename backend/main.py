import os, logging, asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, Header, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from jose import jwt, JWTError
from models import (SearchRequest, SearchResponse, AnalyticsResponse, GenerateRequest, HealthResponse,
                    LLMQueueResponse, ReconciliationResponse, ReconciliationRecord,
                    PaymentRecord, ManualReconcileRequest, ManualReconcileResponse)
from search import search_invoices, list_invoices, get_payments_for_invoice, index_payment, list_payments, search_payments
from analytics import get_analytics, get_llm_queue
import httpx

_kafka_executor = ThreadPoolExecutor(max_workers=1)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger(__name__)

JWT_SECRET = os.getenv("JWT_SECRET", "change-this-in-production")
KAFKA_BROKER = os.getenv("KAFKA_BROKER", "localhost:9092")
ES_HOST = os.getenv("ES_HOST", "http://localhost:9200")
CH_HOST = os.getenv("CH_HOST", "localhost")
CH_PORT = os.getenv("CH_PORT", "8123")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")

app = FastAPI(title="Ledgr API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://frontend:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_tenant(authorization: str = Header(default="")) -> str:
    if not authorization:
        return "DEMO"
    try:
        token = authorization.replace("Bearer ", "")
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload["tenant_id"]
    except (JWTError, KeyError):
        return "DEMO"

def _check_kafka() -> str:
    try:
        from kafka.admin import KafkaAdminClient
        admin = KafkaAdminClient(
            bootstrap_servers=KAFKA_BROKER,
            request_timeout_ms=3000,
            connections_max_idle_ms=5000,
        )
        admin.list_topics()
        admin.close()
        return "healthy"
    except Exception:
        return "unavailable"

@app.get("/api/health", response_model=HealthResponse)
async def health():
    services = {}
    async with httpx.AsyncClient(timeout=3.0) as client:
        try:
            r = await client.get(f"{ES_HOST}/_cluster/health")
            services["elasticsearch"] = "healthy" if r.status_code == 200 else "degraded"
        except Exception:
            services["elasticsearch"] = "unavailable"

        try:
            r = await client.get(f"{OLLAMA_HOST}/api/tags")
            services["ollama"] = "healthy" if r.status_code == 200 else "degraded"
        except Exception:
            services["ollama"] = "unavailable"

        try:
            r = await client.get(f"http://{CH_HOST}:8123/ping")
            services["clickhouse"] = "healthy" if r.status_code == 200 else "degraded"
        except Exception:
            services["clickhouse"] = "unavailable"

    loop = asyncio.get_event_loop()
    services["kafka"] = await loop.run_in_executor(_kafka_executor, _check_kafka)

    all_ok = all(v == "healthy" for v in services.values())
    return HealthResponse(status="healthy" if all_ok else "degraded", services=services)

@app.get("/api/invoices", response_model=SearchResponse)
async def invoices(
    page: int = 1,
    size: int = 50,
    tenant_id: str = Depends(get_tenant),
):
    return list_invoices(tenant_id, page, size)

@app.post("/api/invoices/search", response_model=SearchResponse)
async def search(req: SearchRequest, tenant_id: str = Depends(get_tenant)):
    return search_invoices(req.query, tenant_id, req.page, req.size)

@app.get("/api/analytics", response_model=AnalyticsResponse)
async def analytics(tenant_id: str = Depends(get_tenant)):
    return get_analytics(tenant_id)

def _kafka_backlog_sync() -> list:
    from kafka import KafkaAdminClient, KafkaConsumer, TopicPartition
    from elasticsearch import Elasticsearch
    import clickhouse_driver

    def _kafka_counts():
        try:
            admin    = KafkaAdminClient(bootstrap_servers=KAFKA_BROKER, client_id="ledgr-monitor")
            consumer = KafkaConsumer(bootstrap_servers=KAFKA_BROKER, group_id=None)

            def topic_end_offsets(topic: str) -> int:
                parts = admin.describe_topics([topic])[0]["partitions"]
                tps   = [TopicPartition(topic, p["partition"]) for p in parts]
                return sum(consumer.end_offsets(tps).values())

            def group_lag(group: str, topics: list) -> int:
                try:
                    offsets = admin.list_consumer_group_offsets(group)
                    lag = 0
                    for tp, meta in offsets.items():
                        if tp.topic in topics:
                            ends = consumer.end_offsets([tp])
                            lag += max(0, ends.get(tp, 0) - meta.offset)
                    return lag
                except Exception:
                    return 0

            ingest = topic_end_offsets("invoices-raw") + topic_end_offsets("payments-raw")
            lag    = group_lag("reconciliation-job-v2", ["invoices-raw", "payments-raw"])
            consumer.close()
            admin.close()
            return ingest, lag
        except Exception as e:
            log.warning("Kafka monitor error: %s", e)
            return 0, 0

    def _es_count() -> int:
        try:
            es = Elasticsearch(ES_HOST)
            r  = es.cat.indices(index="invoices-*", h="docs.count", format="json")
            return sum(int(x.get("docs.count", 0) or 0) for x in r)
        except Exception:
            return 0

    def _es_unreconciled() -> int:
        try:
            es = Elasticsearch(ES_HOST)
            r  = es.count(index="invoices-*", body={
                "query": {"terms": {"status": ["UNPAID", "ESCALATED"]}}
            })
            return r["count"]
        except Exception:
            return 0

    def _ch_count() -> int:
        try:
            ch = clickhouse_driver.Client(host=CH_HOST, port=int(CH_PORT.split(":")[0]) if ":" not in CH_PORT else 9000)
            r  = ch.execute("SELECT count() FROM reconciliation.invoices_reconciled")
            return r[0][0]
        except Exception:
            return 0

    def _llm_count() -> int:
        try:
            ch = clickhouse_driver.Client(host=CH_HOST, port=9000)
            r  = ch.execute("SELECT count() FROM reconciliation.invoices_reconciled WHERE confidence < 0.7 AND confidence > 0")
            return r[0][0]
        except Exception:
            return 0

    ingest, recon_lag = _kafka_counts()
    es_count     = _es_count()
    ch_count     = _ch_count()
    llm_count    = _llm_count()
    unreconciled = _es_unreconciled()
    reconciled   = max(0, es_count - unreconciled)

    def lag_status(lag: int) -> str:
        if lag > 500_000: return "critical"
        if lag > 100_000: return "warning"
        return "healthy"

    return [
        {"stage": "Kafka Ingest",         "queued": ingest,       "rate": 0, "eta": 0, "status": "healthy"},
        {"stage": "Kafka Consumer Lag",   "queued": recon_lag,    "rate": 0, "eta": 0, "status": lag_status(recon_lag)},
        {"stage": "Reconciled",           "queued": reconciled,   "rate": 0, "eta": 0, "status": "healthy"},
        {"stage": "Unreconciled",         "queued": unreconciled, "rate": 0, "eta": 0, "status": "warning" if unreconciled > 0 else "healthy"},
        {"stage": "Elasticsearch Sink",   "queued": es_count,     "rate": 0, "eta": 0, "status": "healthy"},
        {"stage": "ClickHouse Sink",      "queued": ch_count,     "rate": 0, "eta": 0, "status": "healthy"},
        {"stage": "Ollama LLM",           "queued": llm_count,    "rate": 0, "eta": 0, "status": "healthy"},
    ]

@app.get("/api/monitoring/backlog")
async def backlog():
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_kafka_executor, _kafka_backlog_sync)

@app.get("/api/monitoring/llm-queue", response_model=LLMQueueResponse)
async def llm_queue(tenant_id: str = Depends(get_tenant)):
    return get_llm_queue(tenant_id)

@app.get("/api/reconciliation", response_model=ReconciliationResponse)
async def reconciliation(
    status: str = "",
    page: int = 1,
    size: int = 50,
    tenant_id: str = Depends(get_tenant),
):
    from search import get_es
    from models import InvoiceRecord
    es = get_es()
    index = f"invoices-{tenant_id.lower()}"
    must = [{"term": {"tenant_id": tenant_id}}]
    if status:
        must.append({"terms": {"status": status.split(",")}})
    body = {
        "query": {"bool": {"must": must}},
        "from": (page - 1) * size,
        "size": size,
        "sort": [{"invoice_date": "desc"}],
    }
    try:
        if not es.indices.exists(index=index):
            return ReconciliationResponse(total=0, records=[])
        resp = es.search(index=index, body=body)
        total = resp["hits"]["total"]["value"]
        records = []
        for h in resp["hits"]["hits"]:
            src = h["_source"]
            records.append(ReconciliationRecord(
                invoice_id=src.get("invoice_id", ""),
                tenant_id=src.get("tenant_id", ""),
                merchant=src.get("merchant", ""),
                customer=src.get("customer", ""),
                amount=float(src.get("amount", 0)),
                invoice_date=src.get("invoice_date", ""),
                due_date=src.get("due_date", ""),
                status=src.get("status", "UNPAID"),
                confidence=float(src.get("confidence", 0)),
                matched_payment_id=src.get("matched_payment_id"),
                due_amount=float(src.get("due_amount", 0)),
                reasoning=src.get("reasoning"),
                payment_amount_paid=src.get("payment_amount_paid"),
                payment_date=src.get("payment_date"),
                payment_method=src.get("payment_method"),
            ))
        return ReconciliationResponse(total=total, records=records)
    except Exception as e:
        log.error("Reconciliation query error: %s", e)
        return ReconciliationResponse(total=0, records=[])

@app.get("/api/payments", response_model=dict)
async def payments_list(
    page: int = 1,
    size: int = 100,
    tenant_id: str = Depends(get_tenant),
):
    return list_payments(tenant_id, page, size)

@app.post("/api/payments/search", response_model=dict)
async def payments_search(
    req: SearchRequest,
    tenant_id: str = Depends(get_tenant),
):
    return search_payments(req.query, tenant_id, req.page, req.size)

@app.get("/api/payments/{invoice_id}", response_model=list[PaymentRecord])
async def payments_for_invoice(invoice_id: str, tenant_id: str = Depends(get_tenant)):
    rows = get_payments_for_invoice(invoice_id, tenant_id)
    return [PaymentRecord(**r) for r in rows]

@app.post("/api/reconciliation/manual", response_model=ManualReconcileResponse)
async def manual_reconcile(req: ManualReconcileRequest, tenant_id: str = Depends(get_tenant)):
    from search import get_es
    from analytics import get_client as ch_client

    es = get_es()
    inv_index = f"invoices-{tenant_id.lower()}"

    payments = get_payments_for_invoice(req.invoice_id, tenant_id)
    matched = next((p for p in payments if p["payment_id"] == req.payment_id), None)

    update_doc: dict = {
        "status": req.status,
        "matched_payment_id": req.payment_id,
        "confidence": 1.0,
        "due_amount": req.due_amount,
        "reasoning": f"Manually reconciled. {req.note}".strip().rstrip(".") + ".",
    }
    if matched:
        update_doc["payment_amount_paid"] = matched.get("amount_paid")
        update_doc["payment_date"] = matched.get("payment_date")
        update_doc["payment_method"] = matched.get("method")

    try:
        es.update(index=inv_index, id=req.invoice_id, body={"doc": update_doc}, refresh="wait_for")
        log.info("Manual reconcile | invoice=%s payment=%s status=%s", req.invoice_id, req.payment_id, req.status)
    except Exception as e:
        log.error("ES manual reconcile error: %s", e)
        return ManualReconcileResponse(invoice_id=req.invoice_id, payment_id=req.payment_id, status=req.status, updated=False)

    try:
        ch = ch_client()
        ch.execute(
            "ALTER TABLE reconciliation.invoices_reconciled UPDATE "
            "status=%(s)s, confidence=1.0, matched_payment_id=%(p)s, due_amount=%(d)s "
            "WHERE invoice_id=%(i)s AND tenant_id=%(t)s",
            {"s": req.status, "p": req.payment_id, "d": req.due_amount, "i": req.invoice_id, "t": tenant_id},
        )
    except Exception as e:
        log.warning("ClickHouse manual reconcile update failed: %s", e)

    return ManualReconcileResponse(invoice_id=req.invoice_id, payment_id=req.payment_id, status=req.status, updated=True)

@app.post("/api/generate")
async def generate(req: GenerateRequest, tenant_id: str = Depends(get_tenant)):
    cmd = [
        "python", "job/generate.py",
        "--tenant-id", req.tenant_id,
        "--invoices", str(req.invoices),
        "--payments", str(req.payments),
        "--batch-size", str(req.batch_size),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    return {"status": "started", "pid": proc.pid, "tenant_id": req.tenant_id}
