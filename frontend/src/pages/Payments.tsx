import { useState, useEffect } from 'react'
import axios from 'axios'
import PageHeader from '../components/PageHeader'
import SearchBar from '../components/SearchBar'
import Button from '../components/Button'

const PAGE_SIZE = 100
const METHOD_OPTIONS = ['ALL', 'BANK_TRANSFER', 'CREDIT_CARD', 'ACH']

interface PaymentRecord {
  payment_id: string
  tenant_id: string
  invoice_id: string
  amount_paid: number
  payment_date: string
  method: string
  reference: string
  source: string
  raw_kafka_payload: Record<string, unknown> | null
  candidate_note: string | null
}

const METHOD_COLOR: Record<string, string> = {
  BANK_TRANSFER: '#1877F2',
  CREDIT_CARD:   '#31A24C',
  ACH:           '#F57C00',
}
const METHOD_ICON: Record<string, string> = {
  BANK_TRANSFER: '🏦',
  CREDIT_CARD:   '💳',
  ACH:           '⚡',
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function MethodBadge({ method }: { method: string }) {
  const color = METHOD_COLOR[method] ?? '#90949C'
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: color + '18', padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>
      {METHOD_ICON[method] ?? ''} {method.replace('_', ' ')}
    </span>
  )
}

function SortIcon({ field, sortBy, sortDir }: { field: string; sortBy: string; sortDir: 'asc' | 'desc' }) {
  const active = sortBy === field
  return (
    <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3 }}>
      {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  )
}

function DetailModal({ payment, onClose }: { payment: PaymentRecord; onClose: () => void }) {
  const [kafkaOpen, setKafkaOpen] = useState(false)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', maxWidth: 580, width: '90%', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-lg)' }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700 }}>Payment Detail</h2>
            <code style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{payment.payment_id}</code>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--color-text-3)', lineHeight: 1 }}>×</button>
        </div>

        {([
          ['Payment ID',   <code style={{ fontSize: 12 }}>{payment.payment_id}</code>],
          ['Invoice ID',   <code style={{ fontSize: 12 }}>{payment.invoice_id}</code>],
          ['Amount Paid',  <strong style={{ color: 'var(--color-success)', fontSize: 15 }}>{fmt(payment.amount_paid)}</strong>],
          ['Method',       <MethodBadge method={payment.method} />],
          ['Payment Date', payment.payment_date],
          ['Reference',    payment.reference ? <code style={{ fontSize: 12 }}>{payment.reference}</code> : <span style={{ color: 'var(--color-text-3)' }}>—</span>],
          ['Tenant',       payment.tenant_id],
          ['Source',       payment.source],
        ] as [string, React.ReactNode][]).map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--color-border)', gap: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-3)', flexShrink: 0 }}>{label}</span>
            <span style={{ fontSize: 13, textAlign: 'right' }}>{value}</span>
          </div>
        ))}

        {payment.candidate_note && (
          <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-sm) var(--space-md)', background: 'var(--color-warning-light)', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--color-warning)', fontSize: 13, color: 'var(--color-warning)' }}>
            ⚠ {payment.candidate_note}
          </div>
        )}

        {payment.raw_kafka_payload && (
          <div style={{ marginTop: 'var(--space-md)' }}>
            <button onClick={() => setKafkaOpen(o => !o)} style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-2)', fontWeight: 600 }}>
              {kafkaOpen ? '▼' : '▶'} Raw Kafka Message
            </button>
            {kafkaOpen && (
              <pre style={{ marginTop: 8, padding: 12, background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', fontSize: 11, color: 'var(--color-text-2)', overflowX: 'auto', border: '1px solid var(--color-border)', lineHeight: 1.7 }}>
                {JSON.stringify(payment.raw_kafka_payload, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Payments() {
  const [query, setQuery]             = useState('')
  const [payments, setPayments]       = useState<PaymentRecord[]>([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [loading, setLoading]         = useState(false)
  const [selected, setSelected]       = useState<PaymentRecord | null>(null)
  const [queryParsed, setQueryParsed] = useState<Record<string, unknown> | null>(null)
  const [sortBy, setSortBy]           = useState('payment_date')
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('desc')
  const [methodFilter, setMethodFilter] = useState('')

  const fetchPayments = async (
    q: string, p: number,
    sb: string, sd: 'asc' | 'desc', mf: string,
  ) => {
    setLoading(true)
    try {
      let res
      if (q.trim() === '') {
        const params: Record<string, string | number> = {
          page: p, size: PAGE_SIZE, sort_by: sb, sort_dir: sd,
        }
        if (mf) params.method = mf
        res = await axios.get<{ total: number; payments: PaymentRecord[] }>('/api/payments', { params })
        setQueryParsed(null)
      } else {
        res = await axios.post<{ total: number; payments: PaymentRecord[]; query_parsed: Record<string, unknown> }>(
          '/api/payments/search',
          { query: q, tenant_id: 'DEMO', page: p, size: PAGE_SIZE },
        )
        setQueryParsed((res.data as { query_parsed: Record<string, unknown> }).query_parsed ?? null)
      }
      setPayments(res.data.payments)
      setTotal(res.data.total)
    } catch (err) {
      console.error('Payment fetch failed', err)
      setPayments([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPayments('', 1, sortBy, sortDir, methodFilter) }, [])

  const handleSearch = () => { setPage(1); fetchPayments(query, 1, sortBy, sortDir, methodFilter) }

  const handleSort = (field: string) => {
    if (query.trim()) return
    const newDir = sortBy === field && sortDir === 'desc' ? 'asc' : 'desc'
    setSortBy(field)
    setSortDir(newDir)
    setPage(1)
    fetchPayments('', 1, field, newDir, methodFilter)
  }

  const handleMethodFilter = (m: string) => {
    const next = m === 'ALL' ? '' : m
    setMethodFilter(next)
    setQuery('')
    setPage(1)
    fetchPayments('', 1, sortBy, sortDir, next)
  }

  const handlePrev = () => {
    const p = Math.max(1, page - 1); setPage(p); fetchPayments(query, p, sortBy, sortDir, methodFilter)
  }
  const handleNext = () => {
    if (page * PAGE_SIZE < total) { const p = page + 1; setPage(p); fetchPayments(query, p, sortBy, sortDir, methodFilter) }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const nlActive   = query.trim() !== ''

  const thStyle = (field: string | null): React.CSSProperties => ({
    textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700,
    textTransform: 'uppercase', color: (field && !nlActive && sortBy === field) ? 'var(--color-primary)' : 'var(--color-text-3)',
    borderBottom: '2px solid var(--color-border)', whiteSpace: 'nowrap',
    background: 'var(--color-surface)',
    cursor: (field && !nlActive) ? 'pointer' : 'default',
    userSelect: 'none',
  })

  return (
    <>
      <PageHeader
        title="Payments"
        action={<span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>{total.toLocaleString()} results</span>}
      />

      <SearchBar value={query} onChange={setQuery} onSearch={handleSearch} loading={loading} />

      {/* Method filter pills — hidden during NL search */}
      {!nlActive && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
          {METHOD_OPTIONS.map(m => {
            const active = (m === 'ALL' && !methodFilter) || m === methodFilter
            const color  = m !== 'ALL' ? METHOD_COLOR[m] : undefined
            return (
              <button key={m} onClick={() => handleMethodFilter(m)} style={{
                padding: '5px 14px', borderRadius: 'var(--radius-xl)', border: '1px solid',
                borderColor: active ? (color ?? 'var(--color-primary)') : 'var(--color-border)',
                background: active ? (color ? color + '18' : 'var(--color-primary-light)') : 'transparent',
                color: active ? (color ?? 'var(--color-primary)') : 'var(--color-text-2)',
                fontWeight: active ? 700 : 400, fontSize: 12, cursor: 'pointer',
              }}>
                {m !== 'ALL' && (METHOD_ICON[m] + ' ')}{m === 'ALL' ? 'All Methods' : m.replace(/_/g, ' ')}
              </button>
            )
          })}
        </div>
      )}

      {queryParsed && (
        <div style={{ marginBottom: 'var(--space-md)', padding: '8px 14px', background: 'var(--color-primary-light)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--color-primary)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <strong>Parsed:</strong>
          {!!queryParsed.payment_id_hint && <span>payment_id: <code>{String(queryParsed.payment_id_hint)}</code></span>}
          {!!queryParsed.invoice_id_hint && <span>invoice_id: <code>{String(queryParsed.invoice_id_hint)}</code></span>}
          {(queryParsed.method as string[])?.length > 0 && <span>method: {(queryParsed.method as string[]).join(', ')}</span>}
          {(queryParsed.min_amount as number) > 0 && <span>min: ${queryParsed.min_amount as number}</span>}
          {(queryParsed.max_amount as number) > 0 && <span>max: ${queryParsed.max_amount as number}</span>}
          {!!queryParsed.date_from && <span>from: {String(queryParsed.date_from)}</span>}
          {!!queryParsed.date_to   && <span>to: {String(queryParsed.date_to)}</span>}
          {!!queryParsed.meaning   && <span style={{ color: 'var(--color-text-2)' }}>— {String(queryParsed.meaning)}</span>}
        </div>
      )}

      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', marginBottom: 'var(--space-md)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle(null)}>Payment ID</th>
              <th style={thStyle(null)}>Invoice ID</th>
              <th style={{ ...thStyle('amount_paid'), textAlign: 'right' }} onClick={() => handleSort('amount_paid')}>
                Amount Paid{!nlActive && <SortIcon field="amount_paid" sortBy={sortBy} sortDir={sortDir} />}
              </th>
              <th style={thStyle('method')} onClick={() => handleSort('method')}>
                Method{!nlActive && <SortIcon field="method" sortBy={sortBy} sortDir={sortDir} />}
              </th>
              <th style={thStyle('payment_date')} onClick={() => handleSort('payment_date')}>
                Payment Date{!nlActive && <SortIcon field="payment_date" sortBy={sortBy} sortDir={sortDir} />}
              </th>
              <th style={thStyle(null)}>Reference</th>
              <th style={thStyle(null)}>Note</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-3)', fontSize: 13 }}>Loading…</td></tr>
            ) : payments.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-3)', fontSize: 13 }}>No payments found</td></tr>
            ) : payments.map(p => (
              <tr key={p.payment_id} onClick={() => setSelected(p)}
                style={{ cursor: 'pointer', borderBottom: '1px solid var(--color-border)', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '10px 14px', fontSize: 12 }}>
                  <code style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{p.payment_id}</code>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 12 }}>
                  <code style={{ fontSize: 11, color: 'var(--color-primary)' }}>{p.invoice_id}</code>
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--color-success)' }}>
                  {fmt(p.amount_paid)}
                </td>
                <td style={{ padding: '10px 14px' }}><MethodBadge method={p.method} /></td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--color-text-2)', whiteSpace: 'nowrap' }}>{p.payment_date}</td>
                <td style={{ padding: '10px 14px', fontSize: 12 }}>
                  {p.reference ? <code style={{ fontSize: 11 }}>{p.reference}</code> : <span style={{ color: 'var(--color-text-3)' }}>—</span>}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 12, maxWidth: 200 }}>
                  {p.candidate_note
                    ? <span style={{ color: 'var(--color-warning)', fontSize: 11 }} title={p.candidate_note}>⚠ {p.candidate_note.slice(0, 50)}{p.candidate_note.length > 50 ? '…' : ''}</span>
                    : <span style={{ color: 'var(--color-text-3)' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-sm) var(--space-md)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>
            Page {page} of {totalPages} ({total.toLocaleString()} total)
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <Button size="sm" variant="secondary" onClick={handlePrev} disabled={page === 1}>← Prev</Button>
            <Button size="sm" variant="secondary" onClick={handleNext} disabled={page >= totalPages}>Next →</Button>
          </div>
        </div>
      )}

      {selected && <DetailModal payment={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
