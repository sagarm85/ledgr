import os, logging
from clickhouse_driver import Client
from models import AnalyticsResponse, LLMEvent, LLMQueueResponse

log = logging.getLogger(__name__)
CH_HOST = os.getenv("CH_HOST", "localhost")
CH_PORT = int(os.getenv("CH_PORT", "9000"))
CH_DB   = os.getenv("CH_DB", "reconciliation")

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS invoices_reconciled (
    invoice_id       String,
    tenant_id        String,
    merchant         String,
    customer         String,
    amount           Float64,
    invoice_date     Date,
    due_date         Date,
    status           String,
    confidence       Float32,
    matched_payment_id String,
    due_amount       Float64,
    source           String,
    inserted_at      DateTime DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(invoice_date)
ORDER BY (tenant_id, invoice_date, invoice_id)
"""

def get_client():
    return Client(host=CH_HOST, port=CH_PORT, database=CH_DB)

def ensure_table():
    client = get_client()
    client.execute(f"CREATE DATABASE IF NOT EXISTS {CH_DB}")
    client.execute(CREATE_TABLE_SQL)

def insert_invoice(invoice: dict):
    client = get_client()
    ensure_table()
    client.execute(
        "INSERT INTO invoices_reconciled (invoice_id, tenant_id, merchant, customer, amount, "
        "invoice_date, due_date, status, confidence, matched_payment_id, due_amount, source) VALUES",
        [{
            "invoice_id": invoice.get("invoice_id", ""),
            "tenant_id": invoice.get("tenant_id", ""),
            "merchant": invoice.get("merchant", ""),
            "customer": invoice.get("customer", ""),
            "amount": float(invoice.get("amount", 0)),
            "invoice_date": invoice.get("invoice_date", "2024-01-01"),
            "due_date": invoice.get("due_date", "2024-01-01"),
            "status": invoice.get("status", "UNPAID"),
            "confidence": float(invoice.get("confidence", 0)),
            "matched_payment_id": invoice.get("matched_payment_id") or "",
            "due_amount": float(invoice.get("due_amount", 0)),
            "source": invoice.get("source", "job"),
        }]
    )

def get_analytics(tenant_id: str) -> AnalyticsResponse:
    client = get_client()
    try:
        ensure_table()
    except Exception as e:
        log.warning(f"Could not ensure table: {e}")

    def q(sql, params=None):
        try:
            return client.execute(sql, params or {})
        except Exception as e:
            log.error(f"ClickHouse query error: {e}")
            return []

    totals = q(
        "SELECT count(), sum(amount), sum(due_amount) FROM invoices_reconciled WHERE tenant_id = %(t)s",
        {"t": tenant_id}
    )
    total_invoices = int(totals[0][0]) if totals else 0
    total_due      = float(totals[0][2]) if totals else 0.0

    status_rows = q(
        "SELECT status, count() FROM invoices_reconciled WHERE tenant_id = %(t)s GROUP BY status",
        {"t": tenant_id}
    )
    status_breakdown = {row[0]: int(row[1]) for row in status_rows}

    fully_paid   = status_breakdown.get("FULLY_PAID", 0)
    escalated    = status_breakdown.get("ESCALATED", 0)
    match_rate   = round(fully_paid / total_invoices, 4) if total_invoices else 0.0
    escalated_rate = round(escalated / total_invoices, 4) if total_invoices else 0.0

    daily_rows = q(
        "SELECT invoice_date, count() as cnt, sum(amount) as total "
        "FROM invoices_reconciled WHERE tenant_id = %(t)s "
        "GROUP BY invoice_date ORDER BY invoice_date DESC LIMIT 30",
        {"t": tenant_id}
    )
    daily_volumes = [
        {"date": str(row[0]), "count": int(row[1]), "total": float(row[2])}
        for row in daily_rows
    ]

    return AnalyticsResponse(
        total_invoices=total_invoices,
        total_due=total_due,
        match_rate=match_rate,
        escalated_rate=escalated_rate,
        status_breakdown=status_breakdown,
        daily_volumes=daily_volumes,
        tenant_id=tenant_id,
    )


CREATE_LLM_EVENTS_SQL = """
CREATE TABLE IF NOT EXISTS llm_events (
    invoice_id      String,
    tenant_id       String,
    started_at      DateTime,
    completed_at    Nullable(DateTime),
    duration_ms     Nullable(Int32),
    candidates      Int32 DEFAULT 0,
    outcome         Nullable(String),
    confidence      Nullable(Float32),
    reasoning       Nullable(String),
    status          String
) ENGINE = ReplacingMergeTree()
ORDER BY (tenant_id, started_at, invoice_id)
"""

def ensure_llm_events_table():
    client = get_client()
    client.execute(f"CREATE DATABASE IF NOT EXISTS {CH_DB}")
    client.execute(CREATE_LLM_EVENTS_SQL)

def insert_llm_event(event: dict):
    client = get_client()
    ensure_llm_events_table()
    client.execute("INSERT INTO llm_events VALUES", [event])

def get_llm_queue(tenant_id: str) -> LLMQueueResponse:
    client = get_client()
    try:
        ensure_llm_events_table()
    except Exception as e:
        log.warning("Could not ensure llm_events table: %s", e)

    def q(sql, params=None):
        try:
            return client.execute(sql, params or {})
        except Exception as e:
            log.error("ClickHouse llm_queue error: %s", e)
            return []

    # --- Live LLM events (when Ollama is active) ---
    summary = q(
        "SELECT status, outcome, count(), avg(duration_ms) "
        "FROM reconciliation.llm_events WHERE tenant_id = %(t)s GROUP BY status, outcome",
        {"t": tenant_id}
    )
    queued = completed = active = 0
    total_duration = count_with_duration = 0
    for row in summary:
        status, outcome, cnt, avg_dur = row
        cnt = int(cnt)
        if status == "queued":       queued    += cnt
        elif status == "processing": active    += cnt
        elif status in ("done", "failed"):
            completed += cnt
            if avg_dur:
                total_duration     += avg_dur * cnt
                count_with_duration += cnt

    avg_duration = round(total_duration / count_with_duration, 1) if count_with_duration else None

    # --- Escalated: always read from invoices_reconciled (covers SKIP_LLM=true runs) ---
    esc_row = q(
        "SELECT count() FROM reconciliation.invoices_reconciled "
        "WHERE tenant_id = %(t)s AND status = 'ESCALATED'",
        {"t": tenant_id}
    )
    escalated = int(esc_row[0][0]) if esc_row else 0

    # --- Active queue rows from llm_events ---
    active_rows = q(
        "SELECT invoice_id, tenant_id, toString(started_at), toString(completed_at), "
        "duration_ms, candidates, outcome, confidence, reasoning, status "
        "FROM reconciliation.llm_events WHERE tenant_id = %(t)s AND status IN ('queued','processing') "
        "ORDER BY started_at DESC LIMIT 50",
        {"t": tenant_id}
    )

    # --- Recent completed: prefer llm_events, fall back to ESCALATED invoices ---
    recent_rows = q(
        "SELECT invoice_id, tenant_id, toString(reconciled_at), toString(reconciled_at), "
        "0 as duration_ms, 0 as candidates, status as outcome, confidence, reasoning, 'done' as event_status "
        "FROM reconciliation.invoices_reconciled "
        "WHERE tenant_id = %(t)s AND status = 'ESCALATED' "
        "ORDER BY reconciled_at DESC LIMIT 100",
        {"t": tenant_id}
    ) if not completed else q(
        "SELECT invoice_id, tenant_id, toString(started_at), toString(completed_at), "
        "duration_ms, candidates, outcome, confidence, reasoning, status "
        "FROM reconciliation.llm_events WHERE tenant_id = %(t)s AND status IN ('done','failed') "
        "ORDER BY completed_at DESC LIMIT 100",
        {"t": tenant_id}
    )

    # completed count = llm_events done OR total escalated (whichever is larger)
    completed = max(completed, escalated)

    def to_event(row) -> LLMEvent:
        return LLMEvent(
            invoice_id=row[0], tenant_id=row[1],
            started_at=row[2] or "", completed_at=row[3],
            duration_ms=row[4], candidates=int(row[5] or 0),
            outcome=row[6], confidence=float(row[7]) if row[7] is not None else None,
            reasoning=row[8], status=row[9],
        )

    return LLMQueueResponse(
        queued=queued, active=active, completed=completed, escalated=escalated,
        avg_duration_ms=avg_duration,
        active_records=[to_event(r) for r in active_rows],
        recent_completed=[to_event(r) for r in recent_rows],
    )
