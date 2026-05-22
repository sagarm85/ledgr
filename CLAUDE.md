# CLAUDE.md — Ledgr

Read this before writing a single line of code.
This is the project constitution. Claude CLI uses this as context every session.

---

## What We Are Building

**Ledgr** is a job-driven invoice reconciliation platform that:
- Generates invoice and payment data via a configurable batch job
- Streams data through Kafka
- Reconciles invoices to payments using a local Ollama LLM
- Stores results in Elasticsearch (search) and ClickHouse (analytics)
- Serves a React dashboard using Meta Design System

No CSV uploads. No image processing. No manual data entry. Job injection only.

---

## LLM: Ollama Only (Free, Configurable)

No paid APIs. No Claude API. No OpenAI. Everything runs locally via Ollama.

### Model is Always Configurable

The model is **never hardcoded**. Always read from environment variable.

```bash
# .env — change this to switch models, zero code changes
OLLAMA_MODEL=mistral          # default, balanced
# OLLAMA_MODEL=qwen2.5:7b    # better JSON accuracy
# OLLAMA_MODEL=llama3.2      # good general reasoning
# OLLAMA_MODEL=phi3:mini     # fastest, smallest footprint
# OLLAMA_MODEL=gemma4:9b     # strongest reasoning
```

### Supported Models

| Model | Size | Best For |
|-------|------|----------|
| `mistral` | 7B | Default — balanced speed and accuracy |
| `qwen2.5:7b` | 7B | Best structured JSON accuracy |
| `llama3.2` | 8B | General reasoning |
| `phi3:mini` | 3.8B | Low resource environments |
| `gemma4:9b` | 9B | Complex reasoning tasks |

Any model available via `ollama pull <model>` works here. No code changes.

### Ollama Structured Output (Use Everywhere)

Ollama's `format` parameter uses constrained decoding. The model cannot produce
invalid JSON. No try/except for JSON parsing. No retry logic needed.

```python
# llm/client.py — single wrapper for all Ollama calls

import ollama
import os
from pydantic import BaseModel

MODEL = os.getenv("OLLAMA_MODEL", "mistral")
HOST  = os.getenv("OLLAMA_HOST", "http://localhost:11434")

def call_ollama(prompt: str, schema: type[BaseModel]) -> BaseModel:
    """
    All LLM calls go through here.
    Model is read from OLLAMA_MODEL env var.
    Returns validated Pydantic model — guaranteed valid structure.
    """
    client = ollama.Client(host=HOST)
    response = client.chat(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        format=schema.model_json_schema(),
    )
    return schema.model_validate_json(response.message.content)
```

---

## Data Flow

```
┌─────────────────────────────────────────────────┐
│ Data Generator Job                               │
│   python job/generate.py                        │
│     --tenant-id  ACME                           │
│     --invoices   1000000                        │
│     --payments   800000                         │
│     --batch-size 5000                           │
└──────────────────┬──────────────────────────────┘
                   │ JSON messages
                   ▼
┌─────────────────────────────────────────────────┐
│ Kafka                                            │
│   invoices-raw   (partitions: configurable)     │
│   payments-raw   (partitions: configurable)     │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│ Kafka Streams Job                                │
│   Co-partition by tenant_id + customer_id       │
│   Match invoices ↔ payments                     │
│   Calculate due amount                          │
│   Assign confidence score                       │
│   Low confidence → Ollama reasoning             │
│   Emit → reconciled-invoices topic              │
└──────────────────┬──────────────────────────────┘
                   │ sink connectors (parallel)
          ┌────────┼─────────┐
          ▼        ▼         ▼
   Elasticsearch ClickHouse PostgreSQL
   (search)     (analytics)  (audit)
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│ FastAPI Backend                                  │
│   GET  /api/invoices     → Elasticsearch        │
│   GET  /api/analytics    → ClickHouse           │
│   GET  /api/monitoring   → Kafka metrics        │
│   POST /api/generate     → trigger job          │
│   GET  /api/health       → all services         │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│ React + Meta Design System                      │
│   Dashboard / Invoices / DataFlow / Reports     │
└─────────────────────────────────────────────────┘
```

---

## Multi-Tenancy Rules (Never Violate)

Every record at every layer carries `tenant_id`.
Missing `tenant_id` on any layer = data leak = unacceptable.

```python
# Every Kafka message must include tenant_id
{"tenant_id": "ACME", "invoice_id": "ACME-INV-001", ...}

# Every Elasticsearch query — tenant filter ALWAYS first
{
  "query": {
    "bool": {
      "must": [
        {"term": {"tenant_id": tenant_id}},  # ← ALWAYS FIRST
        # other filters follow
      ]
    }
  }
}

# Every ClickHouse query
SELECT * FROM invoices_reconciled
WHERE tenant_id = 'ACME'               # ← ALWAYS FIRST
AND invoice_date >= '2024-01-01'

# Every FastAPI endpoint validates tenant from JWT
def get_tenant(token: str = Header()) -> str:
    return decode_jwt(token)["tenant_id"]

@app.get("/api/invoices")
async def invoices(tenant_id: str = Depends(get_tenant)):
    ...
```

---

## Project Structure

```
ledgr/
├── .env                         # local config (never commit)
├── .env.example                 # committed, no secrets
├── docker-compose.yml           # all services
│
├── job/
│   └── generate.py              # data generator job
│
├── streams/
│   └── reconciliation_job.py    # Kafka Streams + Ollama
│
├── llm/
│   └── client.py                # single Ollama wrapper
│
├── backend/
│   ├── main.py                  # FastAPI app
│   ├── models.py                # Pydantic schemas
│   ├── search.py                # Elasticsearch queries
│   ├── analytics.py             # ClickHouse queries
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Invoices.tsx
│   │   │   ├── DataFlow.tsx
│   │   │   └── Reports.tsx
│   │   ├── components/          # see DESIGN.md
│   │   └── globals.css          # design tokens
│   └── package.json
│
├── CLAUDE.md                    # this file
├── DESIGN.md                    # UI component guide
└── PROGRESS.md                  # updated after every task
```

---

## Environment Variables (.env.example)

```bash
# LLM — swap model here, no code changes
OLLAMA_MODEL=mistral
OLLAMA_HOST=http://localhost:11434

# Kafka
KAFKA_BROKER=localhost:9092
KAFKA_PARTITIONS=9

# Elasticsearch
ES_HOST=http://localhost:9200
ES_INDEX_PREFIX=invoices

# ClickHouse
CH_HOST=localhost
CH_PORT=8123
CH_DB=reconciliation

# PostgreSQL
PG_URL=postgresql://invoice_user:invoice_pass@localhost:5432/invoice_db

# App
API_PORT=8000
JWT_SECRET=change-this-in-production
LOG_LEVEL=INFO
```

---

## Data Generator Job

```python
# job/generate.py
# python job/generate.py --tenant-id ACME --invoices 1000000 --payments 800000

import argparse, json, random, time, os
from datetime import datetime, timedelta
from faker import Faker
from kafka import KafkaProducer

fake = Faker()

def make_producer():
    return KafkaProducer(
        bootstrap_servers=os.getenv("KAFKA_BROKER", "localhost:9092"),
        value_serializer=lambda v: json.dumps(v).encode(),
        batch_size=65536,
        linger_ms=50,
        compression_type="snappy",
        acks=1,
    )

def run(tenant_id: str, n_invoices: int, n_payments: int, batch_size: int):
    producer = make_producer()
    invoices = []
    start = time.time()

    print(f"Generating {n_invoices:,} invoices → tenant: {tenant_id}")
    for i in range(n_invoices):
        d = fake.date_between(start_date="-6m")
        inv = {
            "invoice_id":   f"{tenant_id}-INV-{i+1:010d}",
            "tenant_id":    tenant_id,
            "merchant":     fake.company(),
            "customer":     fake.company(),
            "amount":       round(random.uniform(100, 50000), 2),
            "invoice_date": d.isoformat(),
            "due_date":     (d + timedelta(days=random.choice([15, 30, 45]))).isoformat(),
            "status":       "UNPAID",
            "source":       "job",
        }
        invoices.append(inv)
        producer.send("invoices-raw", value=inv)
        if (i + 1) % batch_size == 0:
            producer.flush()
            rate = (i + 1) / (time.time() - start)
            print(f"  {i+1:,}/{n_invoices:,}  ({rate:.0f} rec/s)")

    producer.flush()
    print(f"✓ Invoices done in {time.time()-start:.1f}s")

    print(f"Generating {n_payments:,} payments → tenant: {tenant_id}")
    start = time.time()
    targets = random.sample(invoices, min(n_payments, len(invoices)))

    for i, inv in enumerate(targets):
        d = datetime.fromisoformat(inv["invoice_date"])
        pay = {
            "payment_id":   f"{tenant_id}-PAY-{i+1:010d}",
            "tenant_id":    tenant_id,
            "invoice_id":   inv["invoice_id"],
            "amount_paid":  inv["amount"] if random.random() > 0.3
                            else round(inv["amount"] * random.uniform(0.4, 0.9), 2),
            "payment_date": (d + timedelta(days=random.randint(5, 30))).isoformat(),
            "method":       random.choice(["BANK_TRANSFER", "CREDIT_CARD", "ACH"]),
            "reference":    inv["invoice_id"],
            "source":       "job",
        }
        producer.send("payments-raw", value=pay)
        if (i + 1) % batch_size == 0:
            producer.flush()
            rate = (i + 1) / (time.time() - start)
            print(f"  {i+1:,}/{n_payments:,}  ({rate:.0f} rec/s)")

    producer.flush()
    print(f"✓ Payments done in {time.time()-start:.1f}s")

if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Ledgr data generator")
    p.add_argument("--tenant-id",  default="DEMO")
    p.add_argument("--invoices",   type=int, default=10_000)
    p.add_argument("--payments",   type=int, default=8_000)
    p.add_argument("--batch-size", type=int, default=5_000)
    a = p.parse_args()
    run(a.tenant_id, a.invoices, a.payments, a.batch_size)
```

---

## Ollama LLM Client

```python
# llm/client.py

import ollama, os
from pydantic import BaseModel
from typing import Optional

MODEL = os.getenv("OLLAMA_MODEL", "mistral")
HOST  = os.getenv("OLLAMA_HOST", "http://localhost:11434")

class MatchResult(BaseModel):
    matched_payment_id: Optional[str]
    match_type: str        # exact | partial | none
    confidence: float      # 0.0 – 1.0
    due_amount: float
    reasoning: str

class QueryFilters(BaseModel):
    status: list[str]
    min_amount: Optional[float]
    max_amount: Optional[float]
    date_from: Optional[str]
    date_to: Optional[str]
    customer_keywords: list[str]
    meaning: str

def match_invoice(invoice: dict, candidates: list[dict]) -> MatchResult:
    prompt = f"""You are an expert accountant.
Match this invoice to the best payment from the candidates.

INVOICE: {invoice}
CANDIDATE PAYMENTS: {candidates}

Rules:
- Payment reference mentioning invoice ID is a strong signal
- Amount can be partial (50%+ of invoice = likely match)
- Payment must be after invoice date
- Set confidence 0.0–1.0
- If no match, set matched_payment_id to null
"""
    client = ollama.Client(host=HOST)
    response = client.chat(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        format=MatchResult.model_json_schema(),
    )
    return MatchResult.model_validate_json(response.message.content)

def parse_query(user_query: str) -> QueryFilters:
    prompt = f"""Convert this natural language search to filters.

Query: "{user_query}"

Statuses available: FULLY_PAID, PARTIALLY_PAID, UNPAID
Amounts in dollars. Dates as YYYY-MM-DD.
"""
    client = ollama.Client(host=HOST)
    response = client.chat(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        format=QueryFilters.model_json_schema(),
    )
    return QueryFilters.model_validate_json(response.message.content)
```

---

## Docker Compose

```yaml
# docker-compose.yml
version: "3.8"

services:
  ollama:
    image: ollama/ollama:latest
    ports: ["11434:11434"]
    volumes:
      - ollama_data:/root/.ollama
    environment:
      OLLAMA_HOST: "0.0.0.0:11434"

  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    ports: ["9092:9092"]
    depends_on: [zookeeper]
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:29092,PLAINTEXT_HOST://localhost:9092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_NUM_PARTITIONS: ${KAFKA_PARTITIONS:-9}
      KAFKA_DEFAULT_REPLICATION_FACTOR: 1

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.10.0
    ports: ["9200:9200"]
    environment:
      discovery.type: single-node
      xpack.security.enabled: "false"
      ES_JAVA_OPTS: ${ES_JAVA_OPTS:--Xms1g -Xmx1g}
    volumes:
      - es_data:/usr/share/elasticsearch/data

  clickhouse:
    image: clickhouse/clickhouse-server:latest
    ports: ["8123:8123", "9000:9000"]
    volumes:
      - ch_data:/var/lib/clickhouse

  postgres:
    image: postgres:15-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: invoice_user
      POSTGRES_PASSWORD: invoice_pass
      POSTGRES_DB: invoice_db
    volumes:
      - pg_data:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports: ["${API_PORT:-8000}:8000"]
    env_file: .env
    depends_on: [kafka, elasticsearch, clickhouse, postgres, ollama]
    volumes: ["./backend:/app"]
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    depends_on: [backend]
    volumes: ["./frontend/src:/app/src"]

volumes:
  ollama_data:
  es_data:
  ch_data:
  pg_data:
```

Resource limits (memory, CPU) are set per deployment environment — not here.
This file is environment-agnostic.

---

## Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Python files | snake_case | `reconciliation_job.py` |
| Python functions | snake_case | `match_invoice()` |
| Private functions | leading underscore | `_validate_amount()` |
| Constants | UPPER_SNAKE | `OLLAMA_MODEL`, `ES_INDEX` |
| Kafka topics | kebab-case | `invoices-raw`, `reconciled-invoices` |
| ES indices | kebab-case + date | `invoices-2024-01` |
| ClickHouse tables | snake_case | `invoices_reconciled` |
| React components | PascalCase | `InvoiceTable`, `StatsCard` |
| CSS variables | kebab-case | `--color-primary` |

---

## Coding Rules

1. Read CLAUDE.md before every task
2. Read PROGRESS.md for current state
3. Model always from `os.getenv("OLLAMA_MODEL", "mistral")` — never hardcoded
4. `tenant_id` in every query — no exceptions
5. Pydantic models for all Ollama responses (constrained decoding)
6. Pydantic models for all FastAPI request/response bodies
7. Use `logging` module, not `print` (except in job scripts)
8. One function, one responsibility
9. After every completed task, update PROGRESS.md

---

## Quick Start

```bash
# Pull model (once)
docker exec ledgr-ollama-1 ollama pull mistral

# Start all services
docker-compose up -d

# Verify healthy
curl http://localhost:9200/_cluster/health
curl http://localhost:11434/api/tags
curl http://localhost:8000/api/health

# Generate test data (small)
python job/generate.py --tenant-id DEMO --invoices 10000 --payments 8000

# Generate full dataset (large — run in background)
python job/generate.py --tenant-id DEMO --invoices 1000000 --payments 800000 &

# Open UI
open http://localhost:3000

# Switch model without touching code
# Edit .env → OLLAMA_MODEL=qwen2.5:7b → docker-compose restart backend
```

---

## PROGRESS.md Structure

Update after every completed task:

```markdown
## Active Decisions (never contradict without flagging)
- Ollama only, no paid APIs
- OLLAMA_MODEL read from env, never hardcoded
- tenant_id mandatory on every layer
- No machine-specific config in docker-compose

## In Progress
- [ ] current task

## Completed
- [x] YYYY-MM-DD: description + any gotchas

## Known Issues / Deferred
- [ ] issue
```
