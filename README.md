# Ledgr — AI-Powered Invoice Reconciliation Platform

> Match 1,000,000 invoices against 800,000 payments in real-time using a local LLM — zero cloud APIs, zero cost.

**Ledgr** is a full-stack, job-driven reconciliation engine that streams invoice and payment data through Kafka, reconciles them using a locally-running Ollama LLM, stores results in Elasticsearch + ClickHouse, and serves a live React dashboard.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Data Generator Job                                              │
│  python3 job/generate.py --invoices 1000000 --payments 800000   │
│  Faker-generated merchants, customers, amounts, dates           │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Kafka Producer  ~3,000 rec/s
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Kafka (KRaft — no ZooKeeper)                                    │
│  invoices-raw  ──┐                                              │
│  payments-raw  ──┘  9 partitions, co-partitioned by tenant_id   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Kafka Streams Consumer
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Reconciliation Engine  (streams/reconciliation_job.py)          │
│  ├─ Score ≥ 0.75 → deterministic match (exact/partial)          │
│  └─ Score < 0.75 → Ollama LLM reasoning → MatchResult           │
│     Model: mistral / qwen2.5:7b / llama3.2 / phi3:mini          │
│     Structured output via Pydantic — guaranteed valid JSON       │
└──────────────┬───────────────────┬──────────────────────────────┘
               │                   │
        ┌──────▼──────┐    ┌───────▼────────┐
        │Elasticsearch│    │   ClickHouse   │
        │  (search)   │    │  (analytics)   │
        │ full-text + │    │ aggregations + │
        │ NL queries  │    │ time-series    │
        └──────┬──────┘    └───────┬────────┘
               └─────────┬─────────┘
                         ▼
        ┌─────────────────────────────────┐
        │  FastAPI Backend  :8000         │
        │  GET  /api/invoices  (ES)       │
        │  GET  /api/analytics (CH)       │
        │  GET  /api/monitoring/backlog   │
        │  POST /api/generate             │
        │  GET  /api/health               │
        └────────────────┬────────────────┘
                         ▼
        ┌─────────────────────────────────┐
        │  React + Recharts  :3002        │
        │  Dashboard · Invoices           │
        │  Data Flow · Reports            │
        └─────────────────────────────────┘
```

---

## Stack

| Layer | Technology |
|---|---|
| LLM | Ollama (local) — mistral, qwen2.5:7b, llama3.2, phi3:mini |
| Streaming | Apache Kafka (KRaft, no ZooKeeper) |
| Search | Elasticsearch 8.10 |
| Analytics | ClickHouse |
| Audit | PostgreSQL 15 |
| Backend | FastAPI + Pydantic |
| Frontend | React 18 + Vite + Recharts |
| Data Gen | Python + Faker |
| Infra | Docker Compose |

---

## Prerequisites

- Docker Desktop (≥ 4.x) with at least **8 GB RAM** allocated
- Docker Compose v2 (`docker compose` not `docker-compose`)
- Python 3.11+ with pip (for running the data generator outside Docker)
- Node.js 18+ (for local frontend dev only — not needed for Docker)

---

## Quick Start (6 commands)

```bash
# 1. Clone and enter
git clone <repo-url> ledgr && cd ledgr

# 2. Copy environment config
cp .env.example .env

# 3. Start all services
docker compose up -d

# 4. Fix ClickHouse network access (required — default user is localhost-only)
docker exec ledgr-clickhouse-1 bash -c "cat > /etc/clickhouse-server/users.d/default-user.xml << 'EOF'
<clickhouse>
  <users>
    <default>
      <networks><ip>::/0</ip></networks>
    </default>
  </users>
</clickhouse>
EOF" && docker restart ledgr-clickhouse-1

# 5. Pull the LLM model (one-time download, ~4 GB)
docker exec ledgr-ollama-1 ollama pull mistral

# 6. Open the dashboard
open http://localhost:3002
```

> **Why step 4?** ClickHouse's Docker image restricts the `default` user to `127.0.0.1` by default. Without this fix the backend cannot query analytics and the ClickHouse health check fails. This is a one-time fix per fresh volume — it survives container restarts but not `docker compose down -v`.

Verify everything is healthy:

```bash
curl http://localhost:8000/api/health
```

Expected:
```json
{
  "status": "healthy",
  "services": {
    "elasticsearch": "healthy",
    "clickhouse": "healthy",
    "ollama": "healthy",
    "kafka": "unknown"
  }
}
```

> `kafka: unknown` is expected — the health check does not yet poll Kafka AdminClient. All other services must be `healthy` before proceeding.

---

## Full Demo Walkthrough

### Step 1 — Verify All Services Are Up

```bash
docker compose ps
```

| Container | External Port | Role |
|---|---|---|
| `ledgr-kafka-1` | 9092 | KRaft broker (no ZooKeeper) |
| `ledgr-elasticsearch-1` | 9200 | Full-text search + NL queries |
| `ledgr-clickhouse-1` | 8123 (HTTP), 9000 (native) | Column-store analytics |
| `ledgr-postgres-1` | 5432 | Audit trail |
| `ledgr-ollama-1` | 11434 | Local LLM inference |
| `ledgr-backend-1` | 8000 | FastAPI REST API |
| `ledgr-frontend-1` | **3002** | React dashboard |

---

### Step 2 — Install Python Dependencies

The data generator runs outside Docker and needs a few packages:

```bash
pip3 install faker kafka-python
```

---

### Step 3 — Generate a Small Dataset First (Smoke Test)

```bash
python3 job/generate.py \
  --tenant-id DEMO \
  --invoices 10000 \
  --payments 8000 \
  --batch-size 1000
```

Expected output:
```
Generating 10,000 invoices → tenant: DEMO
  1,000/10,000  (2,847 rec/s)
  ...
✓ Invoices done in 3.5s
Generating 8,000 payments → tenant: DEMO
  ...
✓ Payments done in 2.8s
```

Open the dashboard at **http://localhost:3002** — invoices will appear in the Invoices page and KPI cards will populate on Dashboard as the reconciliation job processes them.

---

### Step 4 — Generate Heavy Demo Data (The Impressive Part)

Run multiple tenants in parallel to simulate a real multi-tenant SaaS workload:

```bash
# Terminal 1 — ACME Corp: 1M invoices, 800K payments
python3 job/generate.py \
  --tenant-id ACME \
  --invoices 1000000 \
  --payments 800000 \
  --batch-size 5000 &

# Terminal 2 — GlobalTech: 500K invoices, 420K payments
python3 job/generate.py \
  --tenant-id GLOBALTECH \
  --invoices 500000 \
  --payments 420000 \
  --batch-size 5000 &

# Terminal 3 — NovaPay: 250K invoices, 200K payments
python3 job/generate.py \
  --tenant-id NOVAPAY \
  --invoices 250000 \
  --payments 200000 \
  --batch-size 5000 &

wait && echo "All tenants loaded."
```

Total: **1.75M invoices + 1.42M payments** across 3 tenants. At ~3,000 rec/s this takes roughly 10–12 minutes. Leave it running and proceed to the next steps.

---

### Step 5 — Watch the Dashboard Live

Open **http://localhost:3002** and navigate through each page while data flows in.

#### Dashboard Page
Shows real-time KPIs backed by ClickHouse aggregations:
- **Total Invoices** — count growing as records are reconciled
- **Total Due ($)** — sum of all outstanding `due_amount` values
- **Match Rate** — percentage reconciled with Ollama confidence ≥ 0.75
- **Escalated** — invoices routed to Ollama for deeper reasoning

Pie chart shows FULLY_PAID / PARTIALLY_PAID / UNPAID / ESCALATED breakdown.
Area chart shows daily invoice volumes over the last 30 days.
Service Health badges show live status of Elasticsearch, ClickHouse, Ollama, Kafka.

#### Invoices Page — Natural Language Search

> **Latency note:** NL search routes through Ollama (`mistral` takes ~60s per structured-output call). For a snappy demo use `phi3:mini` (see Step 7). The search has a graceful fallback — if Ollama is slow or unavailable, results are returned immediately using a passthrough filter (all invoices shown, no NL parsing).

The search bar sends queries to Ollama which converts them to Elasticsearch filters:

```
overdue invoices from last month
unpaid invoices over $10,000
partially paid from ACME tenant
large invoices matched with low confidence
```

Each result row shows:
- Invoice ID (monospace), merchant, customer, amount
- Status badge: ✓ Matched (green) · ⚠ Partial (amber) · ✗ Unpaid (red) · 🔍 Review (purple)
- Confidence bar (0–100%) — color shifts green → amber → red as confidence falls

Click any row to open the detail drawer showing matched payment ID, due amount, and full LLM reasoning text.

#### Data Flow Page
Auto-refreshes every 3 seconds. Shows 6 pipeline stage cards — all `HEALTHY` when services are running:
- **Kafka Ingest** — records queued, ingest rate (rec/s), ETA to clear
- **Reconciliation** — stream processing lag
- **Elasticsearch Sink** — indexing queue
- **ClickHouse Sink** — batch insert queue
- **Ollama LLM** — low-confidence invoices awaiting LLM reasoning
- **PostgreSQL Audit** — audit write queue

Pipeline Architecture diagram shows the full data flow visually.

#### Reports Page
Three charts backed by ClickHouse (columnar — fast even at 1M+ rows):
- **Invoice Status Distribution** — pie chart with percentage labels per status
- **Daily Invoice Value** — area chart of $ amounts over last 30 days
- **Daily Invoice Count** — bar chart of record counts per day

Summary Statistics table below shows total invoices, total due amount, match rate %, escalated rate %, and per-status counts.

---

### Step 6 — Demonstrate Multi-Tenancy Isolation

Run the same query for different tenants — each is fully isolated at the Elasticsearch index level:

```bash
# ACME invoices only (separate ES index: invoices-acme)
curl "http://localhost:8000/api/invoices?q=unpaid+over+5000" \
  -H "Authorization: Bearer $(python3 -c "
from jose import jwt
print(jwt.encode({'tenant_id':'ACME'}, 'change-this-in-production', algorithm='HS256'))
  ")"

# GLOBALTECH invoices only (separate ES index: invoices-globaltech)
curl "http://localhost:8000/api/invoices?q=unpaid+over+5000" \
  -H "Authorization: Bearer $(python3 -c "
from jose import jwt
print(jwt.encode({'tenant_id':'GLOBALTECH'}, 'change-this-in-production', algorithm='HS256'))
  ")"
```

Each request hits a completely separate Elasticsearch index — zero cross-tenant data leakage by design. Without a valid JWT, requests default to the `DEMO` tenant.

---

### Step 7 — Switch the LLM Model Live (Zero Code Changes)

For faster NL search during demos, switch to `phi3:mini` (3.8B — responds in ~5s vs 60s for mistral):

```bash
# Pull the faster model
docker exec ledgr-ollama-1 ollama pull phi3:mini

# Update .env — no code changes needed
sed -i '' 's/OLLAMA_MODEL=.*/OLLAMA_MODEL=phi3:mini/' .env

# Restart backend to pick up new env
docker compose restart backend
```

The model name in the Sidebar footer updates immediately. All subsequent Ollama calls use the new model.

Available models:

| Model | Size | Pull Command | Best For |
|---|---|---|---|
| `phi3:mini` | 3.8B | `ollama pull phi3:mini` | **Fastest — recommended for demos** |
| `mistral` | 7B | `ollama pull mistral` | Default — balanced |
| `qwen2.5:7b` | 7B | `ollama pull qwen2.5:7b` | Best JSON accuracy |
| `llama3.2` | 8B | `ollama pull llama3.2` | General reasoning |
| `gemma4:9b` | 9B | `ollama pull gemma4:9b` | Strongest reasoning |

---

### Step 8 — Run the Reconciliation Pipeline Manually

The reconciliation job (`streams/reconciliation_job.py`) runs standalone against Kafka. Install its dependencies and launch it:

```bash
pip3 install kafka-python ollama pydantic elasticsearch clickhouse-driver

python3 streams/reconciliation_job.py
```

It will:
1. Consume from `invoices-raw` and `payments-raw` Kafka topics
2. Match invoices to payments by reference, amount, and date
3. Route low-confidence pairs to Ollama for LLM reasoning
4. Emit reconciled records to Elasticsearch and ClickHouse
5. The Dashboard and Reports pages update in real time as records flow in

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health (ES, CH, Ollama, Kafka) |
| `GET` | `/api/invoices?q=&page=&size=` | NL search via Ollama + Elasticsearch |
| `POST` | `/api/invoices/search` | Search with structured body |
| `GET` | `/api/analytics` | ClickHouse aggregations |
| `GET` | `/api/monitoring/backlog` | Pipeline stage metrics |
| `POST` | `/api/generate` | Trigger data generation job |

Interactive docs: **http://localhost:8000/docs**

---

## Environment Variables

All config lives in `.env`. The values below are what the services use inside Docker — host-side tools (curl, psql) use `localhost` instead of service names.

```bash
# LLM — swap model here, no code changes
OLLAMA_MODEL=mistral
OLLAMA_HOST=http://ollama:11434

# Kafka
KAFKA_BROKER=kafka:29092
KAFKA_PARTITIONS=9

# Elasticsearch
ES_HOST=http://elasticsearch:9200

# ClickHouse — port 9000 is the native protocol used by clickhouse-driver
CH_HOST=clickhouse
CH_PORT=9000
CH_DB=reconciliation

# PostgreSQL
PG_URL=postgresql://invoice_user:invoice_pass@postgres:5432/invoice_db

# App
API_PORT=8000
JWT_SECRET=change-this-in-production
LOG_LEVEL=INFO
```

---

## Project Structure

```
ledgr/
├── job/
│   └── generate.py              # Kafka producer — Faker-generated invoices & payments
├── streams/
│   └── reconciliation_job.py    # Kafka consumer — match engine + Ollama LLM
├── llm/
│   └── client.py                # Ollama wrapper — structured output via Pydantic
├── backend/
│   ├── main.py                  # FastAPI app — all routes
│   ├── models.py                # Pydantic request/response schemas
│   ├── search.py                # Elasticsearch query builder
│   ├── analytics.py             # ClickHouse query builder (uses native port 9000)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.tsx
│       ├── api.ts               # Typed axios wrappers for all 6 endpoints
│       ├── globals.css          # Meta Design System tokens
│       ├── components/
│       │   ├── Button.tsx
│       │   ├── ConfidenceBar.tsx
│       │   ├── DataFlowCard.tsx
│       │   ├── InvoiceTable.tsx
│       │   ├── PageHeader.tsx
│       │   ├── SearchBar.tsx
│       │   ├── Sidebar.tsx
│       │   ├── StatsCard.tsx
│       │   └── StatusBadge.tsx
│       └── pages/
│           ├── Dashboard.tsx    # KPI cards + area chart + pie chart + service health
│           ├── Invoices.tsx     # NL search + table + detail drawer
│           ├── DataFlow.tsx     # 6 pipeline stage cards, 3s auto-refresh
│           └── Reports.tsx      # ClickHouse aggregations + bar + pie charts
├── backend/tests/               # Integration test suite
│   ├── seed.py                  # Inserts dummy data into ES + ClickHouse
│   ├── conftest.py              # pytest fixtures
│   ├── test_health.py
│   ├── test_search.py
│   ├── test_analytics.py
│   └── test_tenancy.py
├── frontend/e2e/                # Playwright E2E tests
│   ├── dashboard.spec.ts
│   ├── invoices.spec.ts
│   ├── dataflow.spec.ts
│   └── reports.spec.ts
├── run_tests.sh                 # Test runner: backend pytest + Playwright E2E
├── docker-compose.yml
├── .env.example
├── CLAUDE.md
├── DESIGN.md
└── PROGRESS.md
```

---

## Useful Commands

```bash
# View logs for a specific service
docker compose logs -f backend
docker compose logs -f kafka

# Restart a single service
docker compose restart backend

# Check Elasticsearch indices
curl http://localhost:9200/_cat/indices?v

# Query ClickHouse directly (inside container — avoids auth issues)
docker exec ledgr-clickhouse-1 clickhouse-client \
  --query "SELECT status, count() FROM reconciliation.invoices_reconciled GROUP BY status"

# Check Kafka topics
docker exec ledgr-kafka-1 kafka-topics --bootstrap-server localhost:9092 --list

# Check Ollama models loaded
curl http://localhost:11434/api/tags

# Tail reconciliation job output (standalone script, not a Docker service)
python3 streams/reconciliation_job.py 2>&1 | tee reconciliation.log

# Stop everything and clean volumes (full reset)
docker compose down -v
```

---

## Resetting for a Clean Demo

```bash
# Stop all services and wipe all data volumes
docker compose down -v

# Restart fresh
docker compose up -d

# Re-apply ClickHouse network fix (required after volume wipe)
docker exec ledgr-clickhouse-1 bash -c "cat > /etc/clickhouse-server/users.d/default-user.xml << 'EOF'
<clickhouse>
  <users>
    <default>
      <networks><ip>::/0</ip></networks>
    </default>
  </users>
</clickhouse>
EOF" && docker restart ledgr-clickhouse-1

# Wait ~30s, then verify health
curl http://localhost:8000/api/health

# Re-run data generation
python3 job/generate.py --tenant-id DEMO --invoices 10000 --payments 8000
```

---

## Deferred / Roadmap

- [ ] Wire `GET /api/monitoring/backlog` to real Kafka AdminClient consumer lag
- [ ] PostgreSQL audit sink in the reconciliation job
- [ ] Nginx production proxy config for frontend Docker image
- [ ] Kafka Streams UI (topic partition heatmap)
- [ ] Multi-tenant JWT login screen
