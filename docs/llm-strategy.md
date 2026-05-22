# LLM Strategy

## Local Ollama (Current)

All LLM calls run locally via [Ollama](https://ollama.com). No paid API keys.
The model is **never hardcoded** — change it in `.env` with zero code changes.

```bash
# .env
OLLAMA_MODEL=mistral        # default — balanced speed and accuracy
OLLAMA_MODEL=qwen2.5:7b    # best structured JSON accuracy
OLLAMA_MODEL=llama3.2      # good general reasoning
OLLAMA_MODEL=phi3:mini     # fastest, lowest memory footprint
OLLAMA_MODEL=gemma4:9b     # strongest reasoning
```

### Structured Output

Ollama's `format` parameter uses constrained decoding — the model physically cannot
produce invalid JSON. No try/except for parsing, no retry logic.

```python
# llm/client.py
def match_invoice(invoice, candidates) -> MatchResult:
    client = ollama.Client(host=HOST)
    response = client.chat(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        format=MatchResult.model_json_schema(),   # constrained decoding
    )
    return MatchResult.model_validate_json(response.message.content)
```

---

## Speed Comparison: Local vs Paid

### Local Ollama (CPU)
- ~15-30 seconds per invoice
- Strictly sequential (Ollama processes one request at a time)
- 47,901 ESCALATED records at 0.06/s = **~9 days**

### Local Ollama (GPU)
- ~2-5 seconds per invoice
- Still sequential
- 47,901 records at 0.3/s = **~44 hours**

### Paid LLM APIs

| Model | Latency/call | 10 parallel | 50 parallel | Cost est. |
|-------|-------------|-------------|-------------|-----------|
| Claude Haiku 4.5 | ~0.5-1s | ~80 min | **~16 min** | ~$1-2 |
| Claude Sonnet 4.6 | ~2-5s | ~4 hours | ~50 min | ~$15-30 |
| GPT-4o-mini | ~1-2s | ~2 hours | ~25 min | ~$2-5 |
| GPT-4o | ~5-10s | ~8 hours | ~2 hours | ~$50-100 |

*Estimates for 47,901 invoices with ~200 token prompt + 50 token response.*

**Recommendation for production:** Claude Haiku 4.5 — cheapest, fastest, accurate
enough for structured invoice matching. Total cost < $2 for the entire 47K batch.

---

## Switching to a Paid API

The codebase is designed for this. All LLM calls go through `llm/client.py`.
To switch, replace `match_invoice()` with an API call and keep the same `MatchResult` return type.

```python
# llm/client.py — Claude API version
import anthropic
from pydantic import BaseModel

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

def match_invoice(invoice: dict, candidates: list[dict]) -> MatchResult:
    prompt = build_prompt(invoice, candidates)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )
    return MatchResult.model_validate_json(response.content[0].text)
```

With a paid API you can increase `REMATCH_WORKERS` to 20-50 (rate limits permitting)
and drop `REMATCH_DELAY_S` to 0 — the API handles concurrency on its side.

---

## Parallel Processing Architecture

### Current (local Ollama)

```
asyncio event loop
    │
    ├── Regular API requests (unblocked)
    │
    └── Batch rematch task (asyncio.create_task)
            │
            ├── await asyncio.to_thread(_rematch_one, inv1, ...)
            │         └── [worker thread] Ollama call (~15-30s)
            │
            ├── await asyncio.sleep(REMATCH_DELAY_S)   ← yields to requests
            │
            ├── await asyncio.to_thread(_rematch_one, inv2, ...)
            │
            └── ...one at a time...
```

Why sequential? Ollama serialises concurrent requests internally anyway.
Running 5 parallel threads just means 5 requests queued at Ollama, saturating CPU.
1 thread at a time + delay keeps the app responsive.

### Paid API (recommended upgrade)

```python
# With paid API: true parallel with asyncio gather
async def _rematch_all_async(tenant_id):
    sem = asyncio.Semaphore(20)   # 20 concurrent calls

    async def _one(inv):
        async with sem:
            result = await call_claude_async(inv, candidates)
            await update_es_async(inv, result)

    await asyncio.gather(*[_one(inv) for inv in all_invoices])
    # 47,901 invoices in ~16 minutes vs 9 days locally
```

---

## Why LLM Resolves What Code Cannot

Code checks **equality**. LLM reasons about **intent** using world knowledge.

### What code can match
```
reference = "DEMO-INV-0000001234"  matches  invoice_id = "DEMO-INV-0000001234"
amount_paid = 999.99               within   0.99 threshold of 999.99
```

### What only LLM can match

**Partial ID in reference**
```
reference = "INV-1234"    →  invoice_id = "DEMO-INV-0000001234"
```
LLM recognises "1234" as an abbreviation of the full invoice ID.
Code would need a complex regex that might cause false positives.

**Company name variation**
```
customer = "Acme Corporation"  →  payment note = "ACME CORP payment"
```
LLM knows these refer to the same entity. Code has no world knowledge.

**Semantic date references**
```
invoice: November consulting services
payment note: "Settlement for November work"
```
LLM infers temporal alignment. Code sees two different strings.

**Multi-field weak signals combined**
```
amount: $5,432.10 paid vs $5,432.00 invoice  (slight mismatch)
reference: "srv-2024-11"  (partial, not obvious)
date: 3 days after due date  (slightly late)
```
Each signal alone scores below threshold. LLM weighs all three together and
concludes the probability of this being the correct payment is very high.
Code cannot combine signals into a probabilistic judgement — it only checks rules.

---

## What the Three Stages Cost

Given 1,000,000 invoices with 800,000 having payment candidates:

| Stage | Invoices handled | Cost | Time |
|-------|-----------------|------|------|
| Exact match | ~200K-400K (20-40%) | Free | Instant |
| Fuzzy rules | ~300K-500K (30-50%) | Free | Instant |
| LLM (Ollama) | ~50K-100K (5-20%) | Free | 1-9 days |
| LLM (Haiku) | ~50K-100K (5-20%) | ~$1-5 | 20-80 min |
| No candidates | ~200K (20%) | — | → UNPAID |

The fuzzy pre-filter is the highest-leverage improvement: it eliminates the majority
of LLM calls for free, leaving only genuinely ambiguous cases for Ollama or a paid API.
