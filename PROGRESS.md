## Active Decisions (never contradict without flagging)
- Ollama only, no paid APIs
- OLLAMA_MODEL read from env, never hardcoded
- tenant_id mandatory on every layer
- No machine-specific config in docker-compose
- Frontend uses Vite + React + TypeScript (not CRA)
- shadcn/ui not used — all components are custom inline-style per DESIGN.md
- API proxy: frontend Vite dev server proxies /api → backend:8000

## In Progress
- [ ] None — full build complete

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
- [ ] Kafka Streams monitoring (backlog API) returns static data — wire to real Kafka AdminClient
- [ ] PostgreSQL audit sink not yet implemented (streams job writes to Kafka only)
- [ ] Frontend production Docker build needs nginx proxy config tested
