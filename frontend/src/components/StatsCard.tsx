// src/components/StatsCard.tsx
// Usage: <StatsCard label="Total Invoices" value="1,000,000" color="primary" />

const COLOR_MAP: Record<string, { top: string; bg: string }> = {
  primary: { top: 'var(--color-primary)', bg: 'var(--color-primary-light)' },
  success: { top: 'var(--color-success)', bg: 'var(--color-success-light)' },
  warning: { top: 'var(--color-warning)', bg: 'var(--color-warning-light)' },
  error:   { top: 'var(--color-error)',   bg: 'var(--color-error-light)' },
}

interface StatsCardProps {
  label: string
  value: string | number
  subtitle?: string | null
  color?: 'primary' | 'success' | 'warning' | 'error'
}

export default function StatsCard({ label, value, subtitle = null, color = 'primary' }: StatsCardProps) {
  const c = COLOR_MAP[color]
  return (
    <div style={{
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-lg)',
      borderTop: `3px solid ${c.top}`,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </p>
      <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text)', margin: '8px 0 4px' }}>
        {value}
      </p>
      {subtitle && (
        <p style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{subtitle}</p>
      )}
    </div>
  )
}
