import { useState, useCallback, useRef } from 'react'
import DataFlowCard from '../components/DataFlowCard'
import PageHeader from '../components/PageHeader'
import RefreshBar from '../components/RefreshBar'

interface Stage {
  stage: string
  queued: number
  rate: number
  eta: number
  status: 'healthy' | 'warning' | 'critical'
}

const STAGE_LABEL: Record<string, string> = {
  'Kafka Ingest':       'Total Messages',
  'Kafka Consumer Lag': 'Backlog',
  'Reconciled':         'Invoices',
  'Unreconciled':       'Invoices',
  'Elasticsearch Sink': 'Indexed',
  'ClickHouse Sink':    'Rows',
  'Ollama LLM':         'LLM Calls',
}

const DEFAULT_STAGES: Stage[] = [
  { stage: 'Kafka Ingest',       queued: 0, rate: 0, eta: 0, status: 'healthy' },
  { stage: 'Kafka Consumer Lag', queued: 0, rate: 0, eta: 0, status: 'healthy' },
  { stage: 'Reconciled',         queued: 0, rate: 0, eta: 0, status: 'healthy' },
  { stage: 'Unreconciled',       queued: 0, rate: 0, eta: 0, status: 'healthy' },
  { stage: 'Elasticsearch Sink', queued: 0, rate: 0, eta: 0, status: 'healthy' },
  { stage: 'ClickHouse Sink',    queued: 0, rate: 0, eta: 0, status: 'healthy' },
  { stage: 'Ollama LLM',         queued: 0, rate: 0, eta: 0, status: 'healthy' },
]

// Which stages decrease when healthy (lag/backlog) vs increase (counts)
const LAG_STAGES  = new Set(['Kafka Consumer Lag'])
const COUNT_STAGES = new Set(['Kafka Ingest', 'Reconciled', 'Elasticsearch Sink', 'ClickHouse Sink', 'Ollama LLM'])

function enrichWithRates(next: Stage[], prev: Stage[] | null, dtSec: number): Stage[] {
  if (!prev || dtSec < 1) return next
  return next.map(s => {
    const p = prev.find(x => x.stage === s.stage)
    if (!p) return s
    let rate = 0
    if (LAG_STAGES.has(s.stage))   rate = Math.max(0, Math.round((p.queued - s.queued) / dtSec))
    if (COUNT_STAGES.has(s.stage)) rate = Math.max(0, Math.round((s.queued - p.queued) / dtSec))
    const eta = rate > 0 && LAG_STAGES.has(s.stage)
      ? Math.round(s.queued / rate / 60)   // minutes
      : 0
    return { ...s, rate, eta }
  })
}

export default function DataFlow() {
  const [stages, setStages]               = useState<Stage[]>(DEFAULT_STAGES)
  const [loading, setLoading]             = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const prevRef = useRef<{ stages: Stage[]; time: number } | null>(null)

  const fetchStages = useCallback(async () => {
    setLoading(true)
    try {
      const r    = await fetch('/api/monitoring/backlog')
      const raw: Stage[] = await r.json()
      const now  = Date.now()
      const dtSec = prevRef.current ? (now - prevRef.current.time) / 1000 : 0
      const enriched = enrichWithRates(raw, prevRef.current?.stages ?? null, dtSec)
      prevRef.current = { stages: enriched, time: now }
      setStages(enriched)
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Failed to fetch backlog', err)
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <>
      <PageHeader
        title="Data Flow & Backlog"
        action={
          <RefreshBar onRefresh={fetchStages} loading={loading} lastRefreshed={lastRefreshed} />
        }
      />

      {/* Row 1 — pipeline health: 4 columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-md)',
      }}>
        {stages.slice(0, 4).map(s => (
          <DataFlowCard key={s.stage} {...s} countLabel={STAGE_LABEL[s.stage] ?? 'Count'} />
        ))}
      </div>

      {/* Row 2 — sink & LLM: 3 columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'var(--space-md)',
      }}>
        {stages.slice(4).map(s => (
          <DataFlowCard key={s.stage} {...s} countLabel={STAGE_LABEL[s.stage] ?? 'Count'} />
        ))}
      </div>

      {/* Pipeline diagram */}
      <div style={{
        marginTop: 'var(--space-xl)',
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-lg)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <p style={{ fontWeight: 600, marginBottom: 'var(--space-md)', fontSize: 15 }}>
          Pipeline Architecture
        </p>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--color-text-2)',
          lineHeight: 1.9,
          whiteSpace: 'pre',
          overflowX: 'auto',
        }}>
{`  Generator Job  (job/generate.py)
  --invoices 1,000,000  --payments 800,000
          │
          ▼
  ┌───────────────────────────────────┐
  │  Kafka                            │
  │  invoices-raw   (9 partitions)    │
  │  payments-raw   (9 partitions)    │
  └──────────┬─────────────┬─────────┘
             │             │
             ▼             ▼
  ┌──────────────────┐  ┌─────────────────────┐
  │ Reconciliation   │  │ Payments Indexer     │
  │ Job (Python)     │  │ (job/index_payments) │
  │                  │  └────────┬────────────┘
  │ High confidence  │           │
  │  → FULLY_PAID    │           ▼
  │  → PARTIALLY_PAID│  payments-{tenant}
  │                  │  (Elasticsearch)
  │ Low confidence   │
  │  → Ollama LLM    │
  │    → ESCALATED   │
  └────────┬─────────┘
           │
           ├──────────────────────────┐
           ▼                          ▼
  invoices-{tenant}        reconciliation.invoices_reconciled
  (Elasticsearch)          (ClickHouse)
           │                          │
           └──────────┬───────────────┘
                      ▼
             FastAPI Backend  (:8000)
                      │
                      ▼
             React Dashboard  (:3000)`}
        </div>
      </div>
    </>
  )
}
