import os, logging
from elasticsearch import Elasticsearch, AsyncElasticsearch
from models import InvoiceRecord, SearchResponse, PaymentRecord
from llm.client import parse_query, QueryFilters, parse_payment_query

log = logging.getLogger(__name__)
ES_HOST = os.getenv("ES_HOST", "http://localhost:9200")
INDEX_PREFIX = os.getenv("ES_INDEX_PREFIX", "invoices")

def get_es():
    return Elasticsearch(ES_HOST)

async def get_async_es():
    return AsyncElasticsearch(ES_HOST)

INDEX_MAPPING = {
    "mappings": {
        "properties": {
            "invoice_id":   {"type": "keyword"},
            "tenant_id":    {"type": "keyword"},
            "merchant":     {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
            "customer":     {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
            "amount":       {"type": "float"},
            "invoice_date": {"type": "date"},
            "due_date":     {"type": "date"},
            "status":       {"type": "keyword"},
            "confidence":   {"type": "float"},
            "matched_payment_id": {"type": "keyword"},
            "due_amount":   {"type": "float"},
            "reasoning":    {"type": "text"},
            "source":       {"type": "keyword"},
        }
    }
}

def ensure_index(tenant_id: str):
    es = get_es()
    index = f"{INDEX_PREFIX}-{tenant_id.lower()}"
    if not es.indices.exists(index=index):
        es.indices.create(index=index, body=INDEX_MAPPING)
        log.info(f"Created index: {index}")
    return index

def index_invoice(invoice: dict):
    es = get_es()
    tenant_id = invoice["tenant_id"]
    index = ensure_index(tenant_id)
    es.index(index=index, id=invoice["invoice_id"], document=invoice)

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

def _payments_index(tenant_id: str) -> str:
    return f"payments-{tenant_id.lower()}"

def ensure_payments_index(tenant_id: str):
    es = get_es()
    index = _payments_index(tenant_id)
    if not es.indices.exists(index=index):
        es.indices.create(index=index, body=PAYMENTS_MAPPING)
        log.info("Created payments index: %s", index)

def index_payment(payment: dict):
    es = get_es()
    ensure_payments_index(payment["tenant_id"])
    es.index(index=_payments_index(payment["tenant_id"]), id=payment["payment_id"], document=payment)

def get_payments_for_invoice(invoice_id: str, tenant_id: str) -> list[dict]:
    es = get_es()
    index = _payments_index(tenant_id)
    log.info("ES payments lookup | source=elasticsearch invoice=%s tenant=%s", invoice_id, tenant_id)
    try:
        if not es.indices.exists(index=index):
            return []
        resp = es.search(index=index, body={
            "query": {"bool": {"must": [
                {"term": {"tenant_id": tenant_id}},
                {"term": {"invoice_id": invoice_id}},
            ]}},
            "size": 20,
            "sort": [{"amount_paid": "desc"}],
        })
        results = [h["_source"] for h in resp["hits"]["hits"]]
        log.info("ES payments hit | invoice=%s found=%d", invoice_id, len(results))
        return results
    except Exception as e:
        log.error("ES payments lookup error: %s", e)
        return []

def list_invoices(tenant_id: str, page: int = 1, size: int = 50) -> SearchResponse:
    """Direct ES list — no Ollama, instant response."""
    es = get_es()
    index = f"{INDEX_PREFIX}-{tenant_id.lower()}"
    log.info("ES list | source=elasticsearch tenant=%s page=%d size=%d", tenant_id, page, size)
    try:
        if not es.indices.exists(index=index):
            log.info("ES index %s does not exist — returning empty", index)
            return SearchResponse(total=0, invoices=[])
        body = {
            "query": {"term": {"tenant_id": tenant_id}},
            "from": (page - 1) * size,
            "size": size,
            "sort": [{"invoice_date": "desc"}],
        }
        resp = es.search(index=index, body=body)
        hits = resp["hits"]["hits"]
        total = resp["hits"]["total"]["value"]
        invoices = [InvoiceRecord(**h["_source"]) for h in hits]
        log.info("ES list hit | index=%s total=%d returned=%d", index, total, len(invoices))
        return SearchResponse(total=total, invoices=invoices)
    except Exception as e:
        log.error("ES list error: %s", e)
        return SearchResponse(total=0, invoices=[])


def search_invoices(query: str, tenant_id: str, page: int = 1, size: int = 50) -> SearchResponse:
    es = get_es()
    index = f"{INDEX_PREFIX}-{tenant_id.lower()}"

    try:
        filters = parse_query(query)
    except Exception as e:
        log.warning("Ollama unavailable, using passthrough filter: %s", e)
        filters = QueryFilters(meaning=query)

    must_clauses = [{"term": {"tenant_id": tenant_id}}]
    clean_status = filters.clean_status()

    # Exact invoice ID lookup — bypasses all other filters
    if filters.invoice_id_hint:
        must_clauses.append({"term": {"invoice_id": filters.invoice_id_hint}})
    else:
        if clean_status:
            must_clauses.append({"terms": {"status": clean_status}})

        if filters.min_amount > 0 or filters.max_amount > 0:
            range_q: dict = {}
            if filters.min_amount > 0:
                range_q["gte"] = filters.min_amount
            if filters.max_amount > 0:
                range_q["lte"] = filters.max_amount
            must_clauses.append({"range": {"amount": range_q}})

        if filters.date_from:
            must_clauses.append({"range": {"invoice_date": {"gte": filters.date_from}}})
        if filters.date_to:
            must_clauses.append({"range": {"invoice_date": {"lte": filters.date_to}}})

        if filters.customer_keywords:
            must_clauses.append({"match": {"customer": " ".join(filters.customer_keywords)}})

        if filters.merchant_keywords:
            must_clauses.append({"match": {"merchant": " ".join(filters.merchant_keywords)}})

        # Full-text fallback across merchant + customer for the meaning text
        if filters.meaning and not any([clean_status, filters.customer_keywords, filters.merchant_keywords]):
            must_clauses.append({"multi_match": {
                "query": filters.meaning,
                "fields": ["customer", "merchant"],
                "type": "best_fields",
                "fuzziness": "AUTO",
            }})

    body = {
        "query": {"bool": {"must": must_clauses}},
        "from": (page - 1) * size,
        "size": size,
        "sort": [{"invoice_date": "desc"}],
    }

    import json as _json
    log.info(
        "ES search | tenant=%s query=%r invoice_id=%r status=%s "
        "amount=[%.2f,%.2f] date=[%s,%s] page=%d size=%d\nES query: %s",
        tenant_id, query, filters.invoice_id_hint, clean_status or "all",
        filters.min_amount, filters.max_amount,
        filters.date_from or "*", filters.date_to or "*",
        page, size, _json.dumps(body),
    )

    try:
        if not es.indices.exists(index=index):
            log.info("ES index %s does not exist — returning empty", index)
            return SearchResponse(total=0, invoices=[], query_parsed=filters.model_dump())
        resp = es.search(index=index, body=body)
        hits = resp["hits"]["hits"]
        total = resp["hits"]["total"]["value"]
        invoices = [InvoiceRecord(**h["_source"]) for h in hits]
        log.info("ES search hit | index=%s total=%d returned=%d", index, total, len(invoices))
        return SearchResponse(total=total, invoices=invoices, query_parsed=filters.model_dump())
    except Exception as e:
        log.error("ES search error: %s", e)
        return SearchResponse(total=0, invoices=[])


# ── Payments ──────────────────────────────────────────────────────────────────

def _build_payment_body(must: list, page: int, size: int) -> dict:
    import json as _json
    body = {
        "query": {"bool": {"must": must}},
        "from": (page - 1) * size,
        "size": size,
        "sort": [{"payment_date": "desc"}],
    }
    log.info("ES payments query: %s", _json.dumps(body))
    return body

def list_payments(tenant_id: str, page: int = 1, size: int = 100):
    es = get_es()
    index = _payments_index(tenant_id)
    log.info("ES list payments | source=elasticsearch tenant=%s page=%d size=%d", tenant_id, page, size)
    try:
        if not es.indices.exists(index=index):
            return {"total": 0, "payments": []}
        body = _build_payment_body([{"term": {"tenant_id": tenant_id}}], page, size)
        resp = es.search(index=index, body=body)
        total = resp["hits"]["total"]["value"]
        payments = [h["_source"] for h in resp["hits"]["hits"]]
        log.info("ES list payments hit | index=%s total=%d returned=%d", index, total, len(payments))
        return {"total": total, "payments": payments}
    except Exception as e:
        log.error("ES list payments error: %s", e)
        return {"total": 0, "payments": []}

def search_payments(query: str, tenant_id: str, page: int = 1, size: int = 100):
    es = get_es()
    index = _payments_index(tenant_id)

    try:
        filters = parse_payment_query(query)
    except Exception as e:
        log.warning("Ollama unavailable for payment query, passthrough: %s", e)
        from llm.client import PaymentQueryFilters
        filters = PaymentQueryFilters(meaning=query)

    must = [{"term": {"tenant_id": tenant_id}}]

    if filters.payment_id_hint:
        must.append({"term": {"payment_id": filters.payment_id_hint}})
    elif filters.invoice_id_hint:
        must.append({"term": {"invoice_id": filters.invoice_id_hint}})
    else:
        if filters.method:
            must.append({"terms": {"method": filters.method}})
        if filters.min_amount > 0 or filters.max_amount > 0:
            rng: dict = {}
            if filters.min_amount > 0:
                rng["gte"] = filters.min_amount
            if filters.max_amount > 0:
                rng["lte"] = filters.max_amount
            must.append({"range": {"amount_paid": rng}})
        if filters.date_from:
            must.append({"range": {"payment_date": {"gte": filters.date_from}}})
        if filters.date_to:
            must.append({"range": {"payment_date": {"lte": filters.date_to}}})

    try:
        if not es.indices.exists(index=index):
            return {"total": 0, "payments": [], "query_parsed": filters.model_dump()}
        body = _build_payment_body(must, page, size)
        resp = es.search(index=index, body=body)
        total = resp["hits"]["total"]["value"]
        payments = [h["_source"] for h in resp["hits"]["hits"]]
        log.info("ES search payments hit | index=%s total=%d returned=%d", index, total, len(payments))
        return {"total": total, "payments": payments, "query_parsed": filters.model_dump()}
    except Exception as e:
        log.error("ES search payments error: %s", e)
        return {"total": 0, "payments": [], "query_parsed": None}
