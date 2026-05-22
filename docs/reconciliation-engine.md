# Reconciliation Engine

## Three-Stage Matching

The reconciliation engine resolves invoices to payments in order of confidence.
Each stage only runs if the previous stage could not resolve the invoice.

```
Invoice + Candidate Payments
         │
         ▼
┌─────────────────────────────────────────┐
│ Stage 1: Exact Reference Match          │  ~20-40% of invoices resolved
│                                         │  Confidence: 1.0
│  reference == invoice_id                │
│  AND amount_paid >= invoice.amount*0.99 │ → FULLY_PAID
│  OR  amount_paid >= invoice.amount*0.50 │ → PARTIALLY_PAID
└──────────────────┬──────────────────────┘
                   │ No exact match
                   ▼
┌─────────────────────────────────────────┐
│ Stage 2: Fuzzy Rule Match               │  ~40-60% of remaining resolved
│                                         │  Confidence: 0.90-0.98
│  Scoring system (7 points max):         │
│    +3  invoice_id in payment reference  │
│    +3  amount within 1% (near-exact)    │
│    +2  amount within 5%                 │
│    +1  amount 50-95% (partial)          │
│    +1  payment within due date window   │
│                                         │
│  Score ≥ 5 → auto-resolve               │
│  Score < 5 → send to LLM               │
└──────────────────┬──────────────────────┘
                   │ Score < 5
                   ▼
┌─────────────────────────────────────────┐
│ Stage 3: Ollama LLM                     │  Remaining ~5-20%
│                                         │
│  SKIP_LLM=true  → ESCALATED instantly  │
│  SKIP_LLM=false → Ollama reasoning:    │
│    conf ≥ 0.90  → FULLY_PAID           │
│    conf ≥ 0.75  → PARTIALLY_PAID       │
│    conf < 0.75  → ESCALATED            │
└─────────────────────────────────────────┘
```

## Why Fuzzy Rules Before LLM?

Code checks **equality**. LLM reasons about **intent**. But many ambiguous cases
are resolvable with strong heuristics — no AI reasoning needed.

| Case | Code | Fuzzy Rule | LLM |
|------|------|-----------|-----|
| `reference = "DEMO-INV-0000001234"` matches invoice_id | ✓ Stage 1 | — | — |
| `reference = "INV-1234"` (suffix match) | ✗ | ✓ +3 points | — |
| Amount $999.99 vs invoice $1,000.00 | ✗ (misses 1%) | ✓ +3 points | — |
| `reference = "Nov services"` | ✗ | ✗ | ✓ semantic |
| Company name variation: "Acme" vs "ACME Corp" | ✗ | ✗ | ✓ semantic |
| 3 weak signals combined | ✗ | maybe | ✓ weighs together |

**Rule of thumb:** if you can write the matching rule, write it. Send to LLM only
what requires language understanding or multi-field reasoning.

## Fuzzy Scoring Details

```python
def _fuzzy_score(invoice, pay) -> int:  # 0-7
    score = 0

    # Reference contains invoice ID or suffix (last 8-12 chars)
    if invoice_id in ref or invoice_id[-8:] in ref:
        score += 3      # Strong signal — human typed/pasted the ID

    # Amount match (most reliable signal)
    pct = paid / amount
    if pct >= 0.99:   score += 3   # near-exact — almost certainly same payment
    elif pct >= 0.95: score += 2   # rounding / FX tolerance
    elif pct >= 0.50: score += 1   # partial payment

    # Date window — payment between invoice date and due date + 30 days
    if inv_date <= pay_date <= due_date + 30d:
        score += 1

    # Threshold: score >= 5 = auto-resolve without LLM
```

Score 5 requires either:
- Reference ID match (3) + near-exact amount (3) − 1 = 5 ✓
- Reference ID match (3) + within 5% amount (2) = 5 ✓
- Near-exact amount (3) + 5% amount not possible (same bucket) + date (1) = needs more

## Bulk Load Mode (`SKIP_LLM=true`)

During large data loads (1M+ records), calling Ollama per invoice would take days.
Setting `SKIP_LLM=true` bypasses Stage 3 entirely.

```
SKIP_LLM=true flow:
  Stage 1 (exact)  → FULLY_PAID / PARTIALLY_PAID (instant)
  Stage 2 (fuzzy)  → FULLY_PAID / PARTIALLY_PAID (instant)
  Remaining        → ESCALATED (reasoning = "skipped-llm-bulk-load")
```

After bulk load, resolve ESCALATED records via the UI:

1. **Batch LLM rematch** — click "⚡ Run LLM on All Skipped" in the Reconciliation page
   - Runs async in the background (app stays responsive)
   - Progress banner shows done/total and ETA
   - Fuzzy pre-filter runs first — only truly ambiguous reach Ollama
   - `REMATCH_DELAY_S=1.0` between calls prevents CPU saturation

2. **Manual review** — for records Ollama cannot resolve
   - Select any ESCALATED invoice
   - View candidate payments with match % and raw Kafka payload
   - Click "Match as Fully Paid" or "Match as Partially Paid"
   - Confirm modal → updates ES + ClickHouse instantly

## Status Definitions

| Status | Meaning | Confidence |
|--------|---------|-----------|
| `FULLY_PAID` | Invoice fully matched to a payment | 0.9-1.0 |
| `PARTIALLY_PAID` | Invoice partially matched; due_amount > 0 | 0.75-0.9 |
| `UNPAID` | No candidate payments found | 0.0 |
| `ESCALATED` | Candidates exist but match is ambiguous | < 0.75 or skipped |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/reconciliation` | Paginated list, filterable by status |
| `POST` | `/api/reconciliation/manual` | Human override — set status + payment |
| `POST` | `/api/reconciliation/rematch-skipped` | Start batch LLM on all ESCALATED |
| `GET` | `/api/reconciliation/rematch-status` | Batch job progress (done/total/ETA) |
| `POST` | `/api/reconciliation/{id}/rematch` | Re-run LLM on single invoice |
