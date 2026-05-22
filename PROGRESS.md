## Active Decisions (never contradict without flagging)
- Ollama only, no paid APIs
- OLLAMA_MODEL read from env, never hardcoded
- tenant_id mandatory on every layer
- No machine-specific config in docker-compose
- Frontend uses Vite + React + TypeScript (not CRA)
- shadcn/ui not used — all components are custom inline-style per DESIGN.md
- API proxy: frontend Vite dev server proxies /api → backend:8000

## How to Resume a Session
- Read this file first, then CLAUDE.md
- Run `npx playwright screenshot --browser chromium --wait-for-timeout 4000 "http://localhost:3000/<page>" /tmp/check.png` to verify UI
- Backend health: `curl http://localhost:8000/api/health`
- All services run via `docker-compose up -d`

## In Progress
- [ ] None — all chart fixes complete

## Completed (2026-05-22 Session 3)
- [x] RefreshBar component — reusable interval pill selector (3s/5s/10s/Off) + countdown + Refresh button. Applied to Dashboard, DataFlow, LLMMonitor, Reports. Auto-refresh scrolls to top (smooth) before fetching. File: frontend/src/components/RefreshBar.tsx
- [x] LLM Monitor — was always zero because get_llm_queue() only read llm_events (empty when SKIP_LLM=true). Fixed to read escalated count + recent records from invoices_reconciled as fallback. Bug: ClickHouse alias 'done' as status shadowed WHERE status='ESCALATED' — renamed to event_status. File: backend/analytics.py
- [x] Refresh button UX — fixed-width button, ↻ icon spins via CSS @keyframes (globals.css .spin class), text stays "Refresh" so layout never shifts
- [x] DataFlow page — removed "Loading pipeline status" flash by pre-filling DEFAULT_STAGES; cards always visible with 0 values until first fetch
- [x] Pipeline Architecture diagram updated to reflect actual architecture: Generator → Kafka → Reconciliation Job + Payments Indexer → ES (invoices + payments) + ClickHouse → FastAPI → React

## Completed
- [x] 2026-05-21: Full initial build
  - Root: .env.example, docker-compose.yml
  - job/generate.py — Kafka producer with Faker
  - llm/client.py — Ollama wrapper with Pydantic structured output
  - streams/reconciliation_job.py — Kafka consumer + Ollama LLM reconciliation
  - backend/: FastAPI (main.py, models.py, search.py, analytics.py) + Dockerfile
  - frontend/: Vite React TS app scaffolded + Dockerfile + nginx
  - Decision: used clickhouse-driver for native protocol (port 9000), not HTTP (8123)
  - Decision: JWT tenant extraction defaults to "DEMO" if no auth header (dev convenience)
  - Decision: Elasticsearch index per tenant: invoices-{tenant_id.lower()}
  - Decision: REACT_APP_OLLAMA_MODEL env var renamed to VITE_OLLAMA_MODEL (Vite convention)
- [x] 2026-05-22: Payments ES index populated — job/index_payments.py reads payments-raw from Kafka (group: payments-indexer-v1) and bulk-indexes to payments-{tenant} ES index. 800K payments indexed. Run: PYTHONPATH=. python3.13 job/index_payments.py
- [x] 2026-05-22: 1M record load test — full pipeline working end-to-end
  - Generator: python3.13 job/generate.py --tenant-id DEMO --invoices 1000000 --payments 800000 (~6700 rec/s invoices, ~25000 rec/s payments)
  - streams/reconciliation_job.py rewritten to write directly to ES + ClickHouse (bulk) + Kafka instead of Kafka-only
  - Fixed: ES client v9 incompatibility → use indices.create() with try/except instead of indices.exists()
  - Fixed: ClickHouse date columns require datetime.date objects, not strings → date.fromisoformat()
  - Fixed: Kafka session timeout during LLM calls → session_timeout_ms=60000, heartbeat_interval_ms=20000, max_poll_interval_ms=600000
  - Added: SKIP_LLM=true env var to bypass Ollama during bulk loads (low-confidence invoices → ESCALATED)
  - Added: RECONCILE_BATCH_SIZE env var (default 500) for tuning flush frequency
  - Run streams job: PYTHONPATH=. SKIP_LLM=true python3.13 -u streams/reconciliation_job.py
  - consumer group: reconciliation-job-v2 (v1 abandoned due to session timeout issues)
- [x] 2026-05-22: DataFlow page — added "Updated HH:MM:SS" timestamp + "Refreshing…" state next to Refresh button so users can confirm auto-refresh and manual refresh are working. Refresh button disables during fetch. File: frontend/src/pages/DataFlow.tsx
- [x] 2026-05-22: Reports page pie chart — labels now render inside slices (white bold text), small slices (<7%) skip label to avoid clipping. Removed positional PIE_COLORS in favor of STATUS_HEX keyed by status name so colors always match semantic meaning. Legend shows human labels (Fully Paid vs FULLY_PAID). Status breakdown table rows: removed "View in Reconciliation →" label, metric name is now the hyperlink (colored, underlines on hover), count right-aligned. Files: frontend/src/pages/Reports.tsx
- [x] 2026-05-22: Frontend complete — all components and pages per DESIGN.md
  - src/api.ts — typed axios wrappers for all 6 backend endpoints
  - components/Button.tsx — primary/secondary/danger, sm/md sizes
  - components/DataFlowCard.tsx — pipeline stage card (queued/rate/ETA + progress bar)
  - components/InvoiceTable.tsx — sortable table with skeleton loader, empty state, row hover/click
  - components/Sidebar.tsx — fixed: NavLink replaces <a> + window.location.pathname
  - pages/Dashboard.tsx — 4 KPI cards + AreaChart daily volumes + PieChart status + health badges + Generate Data modal
  - pages/DataFlow.tsx — 6 pipeline stage cards with 3s auto-refresh + manual refresh toggle
  - pages/Invoices.tsx — NL search bar + status filter pills + paginated table + inline detail drawer with LLM reasoning
  - pages/Reports.tsx — summary stats + BarChart daily volumes + PieChart + status breakdown grid
  - Build verified: tsc && vite build — 0 errors, 897 modules, 186 KB gzip

## Known Issues / Deferred
- [x] 2026-05-22: DataFlow monitoring fully wired to live data. 7-card layout (4+3):
  - Kafka Ingest → total messages in topics (log end offset)
  - Kafka Consumer Lag → reconciliation-job-v2 group lag (WARNING >100K, CRITICAL >500K)
  - Reconciled → FULLY_PAID count from ES
  - Unreconciled → UNPAID+ESCALATED count from ES (WARNING if >0)
  - Elasticsearch Sink → total docs in invoices-* indices
  - ClickHouse Sink → total rows in reconciliation.invoices_reconciled
  - Ollama LLM → low-confidence matches (confidence < 0.7) from ClickHouse
  File: backend/main.py _kafka_backlog_sync(), frontend/src/pages/DataFlow.tsx
- [ ] PostgreSQL audit sink not yet implemented (streams job writes to Kafka only)
- [ ] Frontend production Docker build needs nginx proxy config tested
