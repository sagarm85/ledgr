// src/components/DataFlowCard.tsx
// Usage: <DataFlowCard stage="Kafka Streams" queued={12400} rate={450} eta={27} status="healthy" />

const STATUS_COLOR: Record<string, string> = {
  healthy:  'var(--color-success)',
  warning:  'var(--color-warning)',
  critical: 'var(--color-error)',
}

interface DataFlowCardProps {
  stage: string
  queued: number
  rate: number
  eta: number
  status?: 'healthy' | 'warning' | 'critical'
}

export default function DataFlowCard({ stage, queued, rate, eta, status = 'healthy' }: DataFlowCardProps) {
  const color = STATUS_COLOR[status] || 'var(--color-text-2)'
  const progress = Math.max(5, Math.min(100, 100 - (queued / 50000 * 100)))

  return (
    <div style={{
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-md)',
      borderLeft: `4px solid ${color}`,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{stage}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase' }}>{status}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
        {[
          ['Queued', queued?.toLocaleString() ?? '—'],
          ['Rate',   rate ? `${rate}/s` : '—'],
          ['ETA',    eta  ? `${eta}min` : '—'],
        ].map(([k, v]) => (
          <div key={k}>
            <p style={{ fontSize: 10, color: 'var(--color-text-3)', marginBottom: 2 }}>{k}</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{v}</p>
          </div>
        ))}
      </div>

      <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${progress}%`,
          background: color, borderRadius: 3,
          transition: 'width 1s ease',
        }} />
      </div>
    </div>
  )
}
