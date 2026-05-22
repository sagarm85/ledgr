// src/components/StatusBadge.tsx
// Usage: <StatusBadge status="FULLY_PAID" />

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  FULLY_PAID:     { label: '✓ Matched',  color: 'var(--color-success)',   bg: 'var(--color-success-light)' },
  PARTIALLY_PAID: { label: '⚠ Partial',  color: 'var(--color-warning)',   bg: 'var(--color-warning-light)' },
  UNPAID:         { label: '✗ Unpaid',   color: 'var(--color-error)',     bg: 'var(--color-error-light)' },
  ESCALATED:      { label: '🔍 Review',  color: 'var(--color-escalated)', bg: 'var(--color-escalated-light)' },
}

interface StatusBadgeProps {
  status: string
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const s = STATUS[status] || STATUS.UNPAID
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 10px',
      borderRadius: 'var(--radius-xl)',
      background: s.bg,
      color: s.color,
      fontSize: 12,
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}
