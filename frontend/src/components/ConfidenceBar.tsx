// src/components/ConfidenceBar.tsx
// Usage: <ConfidenceBar value={0.88} />

interface ConfidenceBarProps {
  value: number
}

export default function ConfidenceBar({ value }: ConfidenceBarProps) {
  const pct = Math.round((value || 0) * 100)
  const color = value >= 0.75
    ? 'var(--color-success)'
    : value >= 0.5
    ? 'var(--color-warning)'
    : 'var(--color-error)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
      <div style={{
        flex: 1, height: 6,
        background: 'var(--color-border)',
        borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: color,
          borderRadius: 3,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--color-text-2)', width: 32, textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  )
}
