# Ledgr — Production Readiness Summary

## Platform Overview

Ledgr is a full-stack, job-driven **invoice reconciliation platform** that processes millions of invoices against payments using a local LLM — zero cloud API cost. It ingests data through Kafka, reconciles via a 3-stage engine, stores results in Elasticsearch + ClickHouse, and serves a live React dashboard.

**Stack:**

| Layer | Technology |
|---|---|
| LLM | Ollama (local) — mistral, qwen2.5:7b, llama3.2, phi3:mini |
| Streaming | Apache Kafka (KRaft, no ZooKeeper) |
| Search | Elasticsearch 8.10 |
| Analytics | ClickHouse |
| Backend | FastAPI + Pydantic — port **8000** |
| Frontend | React 18 + Vite + Recharts — port **3000** |
| Data Gen | Python + Faker |
| Infra | Docker Compose |

---

## 1. Reconciliation Engine — 3-Stage Matching

The core engine was upgraded from a single-pass approach to a proper pipeline:

| Stage | Method | Coverage | Cost |
|---|---|---|---|
| Stage 1 | Exact reference + amount match | ~20–40% of invoices | Free, instant |
| Stage 2 | Fuzzy rule scoring (7-point system) | ~60–80% of remaining | Free, instant |
| Stage 3 | Ollama LLM reasoning | Only truly ambiguous ~5–20% | Local, ~15–30s each |

**Why this matters:** Before the fuzzy stage, every ambiguous invoice went straight to Ollama. With 47,901 ESCALATED records at ~15s each on CPU, that was **9 days** of processing. The fuzzy pre-filter resolves the majority instantly for free, sending only genuinely ambiguous cases to the LLM.

**Fuzzy scoring signals (`streams/reconciliation_job.py`):**

| Signal | Points |
|---|---|
| Invoice ID substring found in payment reference | +3 |
| Amount within 1% of invoice total (near-exact) | +3 |
| Amount within 5% (rounding / FX tolerance) | +2 |
| Amount 50–95% of invoice (partial payment) | +1 |
| Payment date within due date window + 30 days | +1 |

Score ≥ 5/7 = auto-resolve with confidence 0.90–0.98. Only scores below threshold reach Ollama.

---

## 2. Bulk Load Mode + Batch LLM Rematch

**Problem:** Loading 1M+ records while calling Ollama per invoice would take days and block all API requests.

**Solution:**
- `SKIP_LLM=true` env var — bypasses Stage 3 during bulk load, marks ambiguous records as `ESCALATED` instantly
- After load, **"⚡ Run LLM on All Skipped"** button processes all ESCALATED records asynchronously
- Fuzzy pre-filter runs first before each LLM call — reduces actual Ollama calls dramatically
- Progress bar shows live count + ETA, persists across tab navigation
- Double-click protection — button hidden while job is running (mount status check before display)

**Architecture fix — app freeze root cause:**

The original implementation used `BackgroundTasks` (FastAPI's thread pool) which starved the entire app. Rewritten to:

```
asyncio.create_task(_rematch_all_async)
    └── for each invoice:
            await asyncio.to_thread(_rematch_one, ...)   ← Ollama call in thread
            await asyncio.sleep(DELAY_S)                 ← yields event loop
```

Event loop stays free for all other API requests while the batch runs.

**Pagination fix — ES 10K cap:**

`from`/`size` pagination throws an error when `from + size > 10,000`. Switched to `search_after` cursor-based pagination — correctly fetches all 47,901+ ESCALATED records with no cap.

---

## 3. Data Accuracy — Elasticsearch Total Counts

**Problem:** Invoices page showed 10,000 total. Payments page showed 10,000 total. Actual data: 1,000,000 invoices + 800,000 payments.

**Root cause:** Elasticsearch silently caps `hits.total.value` at 10,000 without `"track_total_hits": true`.

**Fix:** Added `"track_total_hits": True` to all three ES search bodies:
- `list_invoices()` in `backend/search.py`
- `list_payments()` in `backend/search.py`
- `_build_payment_body()` shared by search and list

Now returns exact counts regardless of dataset size.

---

## 4. Natural Language Search Quality

Three separate search correctness bugs fixed:

### Bug 1 — Wrong results on name search (`match` OR default)

```python
# Before — returns any document with "miller" OR "odom"
{"match": {"customer": "Miller-Odom"}}

# After — requires tokens as an ordered phrase
{"match_phrase": {"customer": "Miller-Odom"}}
```

`match_phrase` requires all tokens in order. "Miller-Odom" → `["miller", "odom"]` must appear consecutively. Eliminates false positives from "Miller Inc", "Odom Corp", etc.

### Bug 2 — "Overdue" returned invoices with zero balance

`QueryFilters` had no overdue concept. Ollama guessed `status: ["UNPAID"]`, but UNPAID status does not enforce `due_date < today` or `due_amount > 0`.

**Fix:** Added `overdue: bool` field to `QueryFilters`. When `true`, the ES query adds:

```json
{"range": {"due_date": {"lt": "now/d"}}},
{"range": {"due_amount": {"gt": 0}}}
```

This is the correct semantic definition: past the due date AND still has an outstanding balance.

### Bug 3 — Ollama prompt didn't explain overdue semantics

Updated `parse_query` prompt:
> "Set `overdue: true` ONLY when the user asks for overdue, outstanding, past-due, or unpaid-past-due invoices. Do NOT also set status when overdue is true."

Synonyms ("past-due", "outstanding balances", "behind on payment") now correctly map to the overdue filter.

---

## 5. LLM Monitor — Reasoning Column & Completed Count

### Bug 1 — Completed count = Escalated count (same numbers)

```python
# Before — workaround that masked the real issue
completed = max(completed, escalated)

# After — independently counted from actual LLM calls
# (line removed; completed comes only from llm_events table)
```

When `SKIP_LLM=true`, `llm_events` is empty → `completed = 0` (correct). Escalated is separately counted from `invoices_reconciled WHERE status = 'ESCALATED'`.

### Bug 2 — Reasoning column blank

**Root cause chain:**
1. `_rematch_one` (batch rematch) never wrote to `llm_events` — only updated ES + ClickHouse
2. `llm_events` always empty → `completed = 0`
3. Fallback query ran against `invoices_reconciled` which has no `reasoning` or `reconciled_at` columns
4. Query failed silently → empty results → blank column

**Fix:** After every Ollama call in `_rematch_one`, now inserts a record to `llm_events`:

```python
insert_llm_event({
    "invoice_id": invoice_id, "tenant_id": tenant_id,
    "started_at": _started_at, "completed_at": _completed_at,
    "duration_ms": _duration_ms, "candidates": len(candidates[:5]),
    "outcome": status, "confidence": result.confidence,
    "reasoning": result.reasoning, "status": "done",
})
```

Also fixed the fallback query: replaced non-existent `reconciled_at` with `inserted_at`.

---

## 6. Sort & Filter on Invoices and Payments

Added server-side (ES-backed) sort and filter to both tables. Works correctly across the full 1M+ dataset — not just the currently loaded page.

**Invoices page:**
- Sort columns: Amount, Invoice Date, Due Date, Status, Confidence
- Filter pills: All / Fully Paid / Partially Paid / Unpaid / Escalated
- Sort field is allowlisted in `search.py` to prevent injection

**Payments page:**
- Sort columns: Amount Paid, Payment Date, Method
- Filter pills: All Methods / 🏦 Bank Transfer / 💳 Credit Card / ⚡ ACH

Sort and filter are disabled during NL search (Ollama controls results). Clicking a filter pill while in NL search mode clears the query and applies the filter.

**Backend implementation:**

```python
# search.py
_INVOICE_SORT_FIELDS = {"amount", "invoice_date", "due_date", "confidence", "status"}

def list_invoices(tenant_id, page, size, sort_by="invoice_date", sort_dir="desc", status=""):
    sf = sort_by if sort_by in _INVOICE_SORT_FIELDS else "invoice_date"
    must = [{"term": {"tenant_id": tenant_id}}]
    if status:
        must.append({"terms": {"status": status.split(",")}})
    body = {"query": {"bool": {"must": must}}, "sort": [{sf: sort_dir}], ...}
```

---

## 7. Dashboard — Dual Line Chart

Replaced the single-series invoice area chart with a two-line chart showing both **daily invoices** (blue) and **daily payments** (green) over the last 30 days.

**Data sources:**
- Invoice volumes: ClickHouse `invoices_reconciled` aggregated by `invoice_date`
- Payment volumes: New ES `date_histogram` aggregation on `payments-{tenant}` index

```python
# analytics.py — ES date_histogram for payment daily volumes
resp = es.search(index=f"payments-{tenant_id.lower()}", body={
    "query": {"bool": {"must": [
        {"term": {"tenant_id": tenant_id}},
        {"range": {"payment_date": {"gte": "now-30d/d"}}},
    ]}},
    "size": 0,
    "aggs": {"daily": {"date_histogram": {"field": "payment_date", "calendar_interval": "day"}}}
})
```

Frontend merges both datasets by date — dates with activity in only one series get `0` for the other.

---

## 8. Multi-Tenancy — Never Violated

Every layer enforces `tenant_id` isolation:

| Layer | Mechanism |
|---|---|
| Kafka | `tenant_id` field in every message |
| Elasticsearch | Separate index per tenant: `invoices-{tenant_id.lower()}` |
| ClickHouse | `WHERE tenant_id = ?` as first clause on every query |
| FastAPI | JWT decoded on every request — `tenant_id` mandatory; defaults to `DEMO` in dev |

Without a valid JWT, requests fall back to the `DEMO` tenant. Cross-tenant data leakage is architecturally impossible — each tenant's data lives in a completely separate ES index.

---

## 9. LLM Strategy — Local vs Paid

### Current (local Ollama) — Zero Cost

All LLM calls run locally. Model swappable via `OLLAMA_MODEL` env var — zero code changes.

```bash
OLLAMA_MODEL=mistral        # default — balanced speed and accuracy
OLLAMA_MODEL=qwen2.5:7b    # best structured JSON accuracy
OLLAMA_MODEL=phi3:mini     # fastest, lowest memory footprint
OLLAMA_MODEL=gemma4:9b     # strongest reasoning
```

**Speed on local CPU:** ~15–30s per invoice. With fuzzy pre-filter eliminating ~80% of cases, effective throughput improves significantly.

### Upgrade Path — Paid API

All LLM calls go through `llm/client.py`. Switching is a one-file change.

| Model | Speed (50 parallel) | Cost for 47K records |
|---|---|---|
| Claude Haiku 4.5 | ~16 min | ~$1–2 |
| Claude Sonnet 4.6 | ~50 min | ~$15–30 |
| GPT-4o-mini | ~25 min | ~$2–5 |

**Claude tool use for NL query parsing** gives the same constrained JSON guarantee as Ollama's `format=` parameter, with better semantic understanding for synonyms:

```python
response = anthropic_client.messages.create(
    model="claude-haiku-4-5-20251001",
    tools=[{"name": "set_filters", "input_schema": QueryFilters.model_json_schema()}],
    tool_choice={"type": "tool", "name": "set_filters"},
    messages=[{"role": "user", "content": f'Query: "{user_query}"'}],
)
return QueryFilters.model_validate(response.content[0].input)
```

With paid API, increase `REMATCH_WORKERS` to 20–50 and set `REMATCH_DELAY_S=0` — the API handles concurrency on its side.

### Why LLM Resolves What Code Cannot

Code checks equality. LLM reasons about intent using world knowledge.

| Matching scenario | Code | Fuzzy rules | LLM |
|---|---|---|---|
| `reference == invoice_id` exact | ✓ | — | — |
| `reference = "INV-1234"` (suffix of full ID) | ✗ | ✓ +3 pts | — |
| Amount $999.99 vs invoice $1,000.00 | ✗ | ✓ +3 pts | — |
| `reference = "Nov services"` | ✗ | ✗ | ✓ semantic |
| "Acme Corp" vs "ACME Corporation" | ✗ | ✗ | ✓ world knowledge |
| 3 weak signals combined probabilistically | ✗ | maybe | ✓ weighs all |

---

## 10. Documentation

Three technical references added under `docs/`:

| File | Contents |
|---|---|
| `reconciliation-engine.md` | 3-stage matching diagram, fuzzy scoring details, bulk load mode, status definitions, API endpoints |
| `llm-strategy.md` | Local vs paid speed comparison, parallel architecture, semantic reasoning examples, cost per stage |
| `production-ready-doc.md` | This document |

`README.md` updated with reconciliation engine details, record lifecycle flowchart, tenant isolation table, and key runtime variables reference.

---

## Production Readiness Checklist

| Area | Status | Detail |
|---|---|---|
| Correct total counts at 1M+ scale | ✅ | `track_total_hits` + `search_after` pagination |
| No app freeze during batch LLM | ✅ | `asyncio.create_task` + event loop yield pattern |
| Exact NL search — no false positives | ✅ | `match_phrase` for names; `overdue` filter with due date + balance check |
| Tenant data isolation | ✅ | Enforced at Kafka, ES index, ClickHouse query, and JWT layers |
| LLM cost control | ✅ | Fuzzy pre-filter eliminates ~80% of Ollama calls |
| Manual reconciliation fallback | ✅ | Human override UI with confirmation modal and audit trail |
| Observable batch jobs | ✅ | Progress bar + ETA, persists across tab navigation, double-click protected |
| LLM audit trail | ✅ | `llm_events` table: duration, confidence, reasoning per invoice |
| Bulk load without LLM blocking | ✅ | `SKIP_LLM=true` + post-load async batch rematch |
| Sort & filter at dataset scale | ✅ | Server-side ES sort; allowlisted fields prevent injection |
| Upgrade path to paid LLM | ✅ | Single-file swap; Claude tool use documented |
| Daily invoice + payment trend chart | ✅ | Dual-line chart from ClickHouse + ES date_histogram |
| PostgreSQL audit sink | 🔲 | Deferred — reconciliation job writes ES + ClickHouse only |
| Nginx production proxy | 🔲 | Deferred — UI on :3000, API on :8000 (direct port exposure for dev/demo) |
| Kafka Streams UI | 🔲 | Deferred — partition heatmap not yet implemented |
| Multi-tenant login screen | 🔲 | Deferred — JWT generated manually for now |
