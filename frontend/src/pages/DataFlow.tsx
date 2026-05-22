import { useState, useEffect } from 'react'
import DataFlowCard from '../components/DataFlowCard'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'

interface Stage {
  stage: string
  queued: number
  rate: number
  eta: number
  status: 'healthy' | 'warning' | 'critical'
}

export default function DataFlow() {
  const [stages, setStages] = useState<Stage[]>([])
  const [auto, setAuto] = useState(true)

  const fetchStages = async () => {
    try {
      const r = await fetch('/api/monitoring/backlog')
      setStages(await r.json())
    } catch (err) {
      console.error('Failed to fetch backlog', err)
    }
  }

  useEffect(() => {
    fetchStages()
    if (!auto) return
    const t = setInterval(fetchStages, 3000)
    return () => clearInterval(t)
  }, [auto])

  return (
    <>
      <PageHeader
        title="Data Flow & Backlog"
        action={
          <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
            <Button size="sm" variant="secondary" onClick={fetchStages}>Refresh</Button>
            <label style={{ fontSize: 13, color: 'var(--color-text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={auto}
                onChange={e => setAuto(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Auto (3s)
            </label>
          </div>
        }
      />

      <div className="stage-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'var(--space-md)',
      }}>
        {stages.map(s => <DataFlowCard key={s.stage} {...s} />)}
      </div>

      {stages.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-2xl)',
          color: 'var(--color-text-2)',
        }}>
          <p style={{ fontSize: 48 }}>📡</p>
          <p style={{ fontWeight: 600, marginTop: 'var(--space-sm)' }}>Loading pipeline status…</p>
        </div>
      )}

      {/* Data flow diagram */}
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
          lineHeight: 1.8,
          whiteSpace: 'pre',
          overflowX: 'auto',
        }}>
{`Generator Job  →  Kafka (invoices-raw / payments-raw)
                       ↓
              Reconciliation Job (Python)
                  ├── High confidence → direct match
                  └── Low confidence  → Ollama LLM
                       ↓
              reconciled-invoices (Kafka topic)
              ┌────────┬─────────┐
              ↓        ↓         ↓
       Elasticsearch ClickHouse PostgreSQL
       (search)     (analytics)  (audit)`}
        </div>
      </div>
    </>
  )
}
