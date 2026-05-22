import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import ConfidenceBar from '../components/ConfidenceBar'
import StatusBadge from '../components/StatusBadge'

const REFRESH_INTERVAL = 15_000

interface LLMEvent {
  invoice_id: string
  tenant_id: string
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  candidates: number
  outcome: string | null
  confidence: number | null
  reasoning: string | null
  status: string
}

interface LLMQueue {
  queued: number
  active: number
  completed: number
  escalated: number
  avg_duration_ms: number | null
  active_records: LLMEvent[]
  recent_completed: LLMEvent[]
}

const STATUS_COLOR: Record<string, string> = {
  queued: 'var(--color-text-3)',
  processing: 'var(--color-warning)',
  done: 'var(--color-success)',
  failed: 'var(--color-error)',
}

const OUTCOME_LABEL: Record<string, string> = {
  FULLY_PAID: 'Fully Paid',
  PARTIALLY_PAID: 'Partial',
  ESCALATED: 'Escalated',
  UNPAID: 'Unpaid',
}

function elapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime()
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60_000)}m`
}

function formatMs(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function LLMMonitor() {
  const [data, setData] = useState<LLMQueue | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get<LLMQueue>('/api/monitoring/llm-queue')
      setData(res.data)
      setLastRefresh(new Date())
      setCountdown(REFRESH_INTERVAL / 1000)
    } catch {
      // keep stale data on error
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
    const interval = setInterval(fetch, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetch])

  useEffect(() => {
    const tick = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => clearInterval(tick)
  }, [lastRefresh])

  const card = (label: string, value: number, color: string, sub?: string) => (
    <div style={{
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-lg)',
      boxShadow: 'var(--shadow-sm)',
      borderTop: `3px solid ${color}`,
      flex: 1,
    }}>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-3)', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 800, color }}>{value.toLocaleString()}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 4 }}>{sub}</p>}
    </div>
  )

  const th = (label: string) => (
    <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-3)', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
      {label}
    </th>
  )
  const td = (content: React.ReactNode, extra?: React.CSSProperties) => (
    <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--color-border)', ...extra }}>
      {content}
    </td>
  )

  return (
    <>
      <PageHeader
        title="LLM Processing Queue"
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
              {lastRefresh
                ? `Last refresh: ${lastRefresh.toLocaleTimeString()} · refresh in ${countdown}s`
                : 'Loading…'}
            </span>
            <Button size="sm" variant="secondary" onClick={fetch}>
              {loading ? '…' : 'Refresh Now'}
            </Button>
          </div>
        }
      />

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        {card('Queued', data?.queued ?? 0, 'var(--color-primary)', 'Waiting for thread')}
        {card('Active', data?.active ?? 0, 'var(--color-warning)', 'Ollama processing now')}
        {card('Completed', data?.completed ?? 0, 'var(--color-success)',
          data?.avg_duration_ms ? `Avg ${formatMs(data.avg_duration_ms)}` : undefined)}
        {card('Escalated', data?.escalated ?? 0, 'var(--color-error)', 'Low confidence → review')}
      </div>

      {/* Active processing */}
      <div style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: 'var(--space-lg)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          {(data?.active ?? 0) > 0 && (
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--color-warning)',
              display: 'inline-block',
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
          )}
          <p style={{ fontWeight: 600, fontSize: 14 }}>
            Active &amp; Queued
            <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-text-3)', fontWeight: 400 }}>
              ({(data?.active ?? 0) + (data?.queued ?? 0)} records)
            </span>
          </p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {th('Invoice ID')} {th('Tenant')} {th('Status')} {th('Candidates')} {th('Elapsed')}
            </tr>
          </thead>
          <tbody>
            {(data?.active_records ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-3)', fontSize: 13 }}>
                  No active LLM calls — reconciliation job not running yet
                </td>
              </tr>
            ) : (
              data!.active_records.map(ev => (
                <tr key={ev.invoice_id} style={{ background: ev.status === 'processing' ? 'rgba(245,124,0,0.04)' : undefined }}>
                  {td(<code style={{ fontSize: 12 }}>{ev.invoice_id}</code>)}
                  {td(ev.tenant_id)}
                  {td(
                    <span style={{ fontWeight: 600, color: STATUS_COLOR[ev.status] ?? 'inherit' }}>
                      {ev.status === 'processing' ? '⚡ Processing' : '⏳ Queued'}
                    </span>
                  )}
                  {td(ev.candidates)}
                  {td(elapsed(ev.started_at))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Recent completions */}
      <div style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--color-border)' }}>
          <p style={{ fontWeight: 600, fontSize: 14 }}>
            Recent Completions
            <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-text-3)', fontWeight: 400 }}>
              (last 100)
            </span>
          </p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {th('Invoice ID')} {th('Outcome')} {th('Confidence')} {th('Duration')} {th('Reasoning')}
            </tr>
          </thead>
          <tbody>
            {(data?.recent_completed ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-3)', fontSize: 13 }}>
                  No completed LLM calls yet — start the reconciliation job to see results here
                </td>
              </tr>
            ) : (
              data!.recent_completed.map((ev, i) => (
                <tr key={`${ev.invoice_id}-${i}`}>
                  {td(<code style={{ fontSize: 12 }}>{ev.invoice_id}</code>)}
                  {td(ev.outcome ? <StatusBadge status={ev.outcome} /> : '—')}
                  {td(
                    ev.confidence != null
                      ? <div style={{ minWidth: 120 }}><ConfidenceBar value={ev.confidence} /></div>
                      : '—'
                  )}
                  {td(formatMs(ev.duration_ms), { whiteSpace: 'nowrap' })}
                  {td(
                    <span style={{ color: 'var(--color-text-2)', fontSize: 12 }} title={ev.reasoning ?? ''}>
                      {ev.reasoning ? ev.reasoning.slice(0, 80) + (ev.reasoning.length > 80 ? '…' : '') : '—'}
                    </span>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </>
  )
}
