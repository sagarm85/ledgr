import { useState, useEffect, useCallback } from 'react'

const INTERVALS = [
  { label: '3s',  ms: 3_000 },
  { label: '5s',  ms: 5_000 },
  { label: '10s', ms: 10_000 },
  { label: 'Off', ms: 0 },
]

interface RefreshBarProps {
  onRefresh: () => void
  loading: boolean
  lastRefreshed: Date | null
}

export default function RefreshBar({ onRefresh, loading, lastRefreshed }: RefreshBarProps) {
  const [intervalMs, setIntervalMs] = useState(3_000)
  const [countdown, setCountdown]   = useState(3)

  // Initial fetch on mount
  useEffect(() => { onRefresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh interval — updates numbers in place, no scroll
  useEffect(() => {
    if (intervalMs === 0) return
    const t = setInterval(onRefresh, intervalMs)
    return () => clearInterval(t)
  }, [intervalMs, onRefresh])

  // Countdown tick — resets whenever lastRefreshed changes
  useEffect(() => {
    if (intervalMs === 0) return
    setCountdown(intervalMs / 1000)
    const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => clearInterval(t)
  }, [lastRefreshed, intervalMs])

  const handleInterval = useCallback((ms: number) => {
    setIntervalMs(ms)
    if (ms > 0) setCountdown(ms / 1000)
  }, [])

  const pillBase: React.CSSProperties = {
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    border: '1px solid var(--color-border)',
    cursor: 'pointer',
    transition: 'all 0.15s',
    lineHeight: '20px',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {/* Status text */}
      <span style={{ fontSize: 12, color: 'var(--color-text-3)', whiteSpace: 'nowrap' }}>
        {lastRefreshed
          ? intervalMs === 0
            ? `Updated ${lastRefreshed.toLocaleTimeString()} · paused`
            : `Updated ${lastRefreshed.toLocaleTimeString()} · refresh in ${countdown}s`
          : 'Loading…'}
      </span>

      {/* Interval pills */}
      <div style={{ display: 'flex', gap: 4 }}>
        {INTERVALS.map(({ label, ms }) => {
          const active = ms === intervalMs
          return (
            <button
              key={label}
              onClick={() => handleInterval(ms)}
              style={{
                ...pillBase,
                background: active ? 'var(--color-primary)' : 'var(--color-surface)',
                color:       active ? '#fff'                 : 'var(--color-text-2)',
                borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Manual refresh — fixed width so layout never shifts */}
      <button
        onClick={onRefresh}
        disabled={loading}
        style={{
          ...pillBase,
          minWidth: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        <span className={loading ? 'spin' : ''} style={{ fontSize: 13, lineHeight: 1 }}>↻</span>
        Refresh
      </button>
    </div>
  )
}
