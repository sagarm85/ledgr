import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import ConfidenceBar from '../components/ConfidenceBar'
import Button from '../components/Button'

interface ReconciliationRecord {
  invoice_id: string
  tenant_id: string
  merchant: string
  customer: string
  amount: number
  invoice_date: string
  due_date: string
  status: string
  confidence: number
  matched_payment_id: string | null
  due_amount: number
  reasoning: string | null
  payment_amount_paid: number | null
  payment_date: string | null
  payment_method: string | null
}

interface PaymentRecord {
  payment_id: string
  tenant_id: string
  invoice_id: string
  amount_paid: number
  payment_date: string
  method: string
  reference: string
  raw_kafka_payload: Record<string, unknown> | null
  candidate_note: string | null
}

interface MatchModal {
  invoice: ReconciliationRecord
  payment: PaymentRecord
  status: 'FULLY_PAID' | 'PARTIALLY_PAID'
}

const STATUS_FILTERS = ['ALL', 'FULLY_PAID', 'PARTIALLY_PAID', 'UNPAID', 'ESCALATED']
const PAGE_SIZE = 50

const METHOD_ICON: Record<string, string> = {
  BANK_TRANSFER: '🏦',
  CREDIT_CARD: '💳',
  ACH: '⚡',
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '8px 0', borderBottom: '1px solid var(--color-border)', gap: 12,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-3)', flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: 'var(--color-text)', textAlign: 'right', wordBreak: 'break-all' }}>
        {value}
      </span>
    </div>
  )
}

function Card({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', marginBottom: 'var(--space-md)' }}>
      <div style={{ padding: '10px var(--space-lg)', borderBottom: '1px solid var(--color-border)', borderLeft: `3px solid ${accent}`, fontWeight: 700, fontSize: 13 }}>
        {title}
      </div>
      <div style={{ padding: 'var(--space-md) var(--space-lg)' }}>
        {children}
      </div>
    </div>
  )
}

function KafkaPayload({ payload }: { payload: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false)
  if (!payload) return null
  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--color-text-2)', fontWeight: 600 }}
      >
        {open ? '▼' : '▶'} Raw Kafka Message
      </button>
      {open && (
        <pre style={{
          marginTop: 6, padding: 12, background: 'var(--color-bg)',
          borderRadius: 'var(--radius-md)', fontSize: 11,
          color: 'var(--color-text-2)', overflowX: 'auto',
          border: '1px solid var(--color-border)', lineHeight: 1.6,
        }}>
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  )
}

function CandidatePayments({
  invoice,
  payments,
  loading,
  onMatch,
}: {
  invoice: ReconciliationRecord
  payments: PaymentRecord[]
  loading: boolean
  onMatch: (payment: PaymentRecord, status: 'FULLY_PAID' | 'PARTIALLY_PAID') => void
}) {
  if (loading) return <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>Loading candidates…</p>
  if (payments.length === 0) return <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>No candidate payments found in store.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {payments.map(pay => {
        const pct = Math.round((pay.amount_paid / invoice.amount) * 100)
        const isExact = Math.abs(pay.amount_paid - invoice.amount) < 0.02
        return (
          <div key={pay.payment_id} style={{
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
            padding: 12, background: 'var(--color-bg)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <code style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{pay.payment_id}</code>
                <p style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>
                  {fmt(pay.amount_paid)}
                  <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-3)', marginLeft: 6 }}>
                    ({pct}% of invoice)
                  </span>
                </p>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 8px',
                borderRadius: 'var(--radius-xl)',
                background: isExact ? 'var(--color-success-light)' : 'var(--color-warning-light)',
                color: isExact ? 'var(--color-success)' : 'var(--color-warning)',
              }}>
                {isExact ? 'Exact amount' : `${pct}% match`}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--color-text-2)', marginBottom: 6 }}>
              <span>{METHOD_ICON[pay.method] ?? ''} {pay.method}</span>
              <span>📅 {pay.payment_date}</span>
              {pay.reference && <span>Ref: <code style={{ fontSize: 11 }}>{pay.reference}</code></span>}
            </div>

            {pay.candidate_note && (
              <p style={{ fontSize: 12, color: 'var(--color-warning)', background: 'var(--color-warning-light)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', marginBottom: 8 }}>
                ⚠ {pay.candidate_note}
              </p>
            )}

            <KafkaPayload payload={pay.raw_kafka_payload} />

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Button size="sm" variant="primary" onClick={() => onMatch(pay, 'FULLY_PAID')}>
                Match as Fully Paid
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onMatch(pay, 'PARTIALLY_PAID')}>
                Match as Partially Paid
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ConfirmModal({
  modal,
  onConfirm,
  onCancel,
}: {
  modal: MatchModal
  onConfirm: (note: string, dueAmount: number) => void
  onCancel: () => void
}) {
  const [note, setNote] = useState('')
  const defaultDue = modal.status === 'FULLY_PAID' ? 0 : Math.max(0, modal.invoice.amount - modal.payment.amount_paid)
  const [dueAmount, setDueAmount] = useState(defaultDue)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
      onClick={onCancel}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', maxWidth: 520, width: '90%', boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>Confirm Manual Reconciliation</h2>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-3)' }}>×</button>
        </div>

        <div style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', marginBottom: 'var(--space-lg)', fontSize: 13 }}>
          <InfoRow label="Invoice" value={<code>{modal.invoice.invoice_id}</code>} />
          <InfoRow label="Payment" value={<code>{modal.payment.payment_id}</code>} />
          <InfoRow label="Amount Paid" value={<strong>{fmt(modal.payment.amount_paid)}</strong>} />
          <InfoRow label="Invoice Amount" value={fmt(modal.invoice.amount)} />
          <InfoRow label="Match Status" value={
            <span style={{ fontWeight: 700, color: modal.status === 'FULLY_PAID' ? 'var(--color-success)' : 'var(--color-warning)' }}>
              {modal.status.replace('_', ' ')}
            </span>
          } />
        </div>

        {modal.status === 'PARTIALLY_PAID' && (
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-2)', display: 'block', marginBottom: 4 }}>
              Due Amount (remaining balance)
            </label>
            <input
              type="number"
              value={dueAmount}
              onChange={e => setDueAmount(parseFloat(e.target.value) || 0)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text)', boxSizing: 'border-box' }}
            />
          </div>
        )}

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-2)', display: 'block', marginBottom: 4 }}>
            Note (optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Customer confirmed payment by phone"
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text)', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={() => onConfirm(note, dueAmount)}>
            Confirm Reconciliation
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function Reconciliation() {
  const [searchParams] = useSearchParams()
  const [records, setRecords] = useState<ReconciliationRecord[]>([])
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? 'ALL')
  const [selected, setSelected] = useState<ReconciliationRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})

  const [candidates, setCandidates] = useState<PaymentRecord[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(false)

  const [modal, setModal] = useState<MatchModal | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [rematching, setRematching] = useState(false)
  const [jobStatus, setJobStatus] = useState<{ running: boolean; total: number; done: number; eta_s: number | null } | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadRecords = useCallback(async (status: string, p: number) => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page: p, size: PAGE_SIZE }
      if (status !== 'ALL') params.status = status
      const res = await axios.get<{ total: number; records: ReconciliationRecord[] }>('/api/reconciliation', { params })
      setRecords(res.data.records)
      setTotal(res.data.total)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadStatusCounts = useCallback(async () => {
    try {
      const res = await axios.get<{ status_breakdown: Record<string, number> }>('/api/analytics')
      setStatusCounts(res.data.status_breakdown)
    } catch { /* non-critical */ }
  }, [])

  useEffect(() => { loadRecords(statusFilter, page) }, [statusFilter, page, loadRecords])
  useEffect(() => { loadStatusCounts() }, [loadStatusCounts])

  const loadCandidates = useCallback(async (invoiceId: string) => {
    setCandidatesLoading(true)
    setCandidates([])
    try {
      const res = await axios.get<PaymentRecord[]>(`/api/payments/${invoiceId}`)
      setCandidates(res.data)
    } finally {
      setCandidatesLoading(false)
    }
  }, [])

  const selectInvoice = (r: ReconciliationRecord) => {
    setSelected(r)
    loadCandidates(r.invoice_id)
  }

  const handleFilter = (s: string) => {
    setStatusFilter(s)
    setPage(1)
    setSelected(null)
    setCandidates([])
  }

  const openModal = (inv: ReconciliationRecord, pay: PaymentRecord, status: 'FULLY_PAID' | 'PARTIALLY_PAID') => {
    setModal({ invoice: inv, payment: pay, status })
  }

  const confirmReconcile = async (note: string, dueAmount: number) => {
    if (!modal) return
    setSaving(true)
    try {
      await axios.post('/api/reconciliation/manual', {
        invoice_id: modal.invoice.invoice_id,
        payment_id: modal.payment.payment_id,
        status: modal.status,
        due_amount: dueAmount,
        note,
      })
      setModal(null)
      showToast(`Reconciled ${modal.invoice.invoice_id} as ${modal.status.replace('_', ' ')}`)
      await loadRecords(statusFilter, page)
      setSelected(prev => prev?.invoice_id === modal.invoice.invoice_id
        ? { ...prev, status: modal.status, matched_payment_id: modal.payment.payment_id, confidence: 1.0, due_amount: dueAmount, reasoning: `Manually reconciled. ${note}`.trim() }
        : prev
      )
    } catch {
      showToast('Reconciliation failed — check backend logs')
    } finally {
      setSaving(false)
    }
  }

  const handleRematch = async () => {
    if (!selected) return
    setRematching(true)
    try {
      const res = await axios.post<ReconciliationRecord>(`/api/reconciliation/${selected.invoice_id}/rematch`)
      const updated = res.data
      setSelected(updated)
      setRecords(prev => prev.map(r => r.invoice_id === updated.invoice_id ? updated : r))
      if (updated.status === 'ESCALATED') {
        showToast('LLM could not resolve — still ESCALATED. Review candidates manually.')
      } else {
        showToast(`LLM resolved: ${updated.invoice_id} → ${updated.status.replace('_', ' ')} (confidence ${(updated.confidence * 100).toFixed(0)}%)`)
        await loadStatusCounts()
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'LLM rematch failed'
      showToast(msg)
    } finally {
      setRematching(false)
    }
  }

  const startPolling = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      try {
        const res = await axios.get<{ running: boolean; total: number; done: number; eta_s: number | null }>('/api/reconciliation/rematch-status')
        setJobStatus(res.data)
        if (!res.data.running) {
          clearInterval(pollRef.current!)
          pollRef.current = null
          await loadStatusCounts()
          await loadRecords(statusFilter, page)
        }
      } catch { /* non-critical */ }
    }, 2000)
  }, [loadStatusCounts, loadRecords, statusFilter, page])

  useEffect(() => {
    axios.get<{ running: boolean; total: number; done: number; eta_s: number | null }>('/api/reconciliation/rematch-status')
      .then(res => {
        setJobStatus(res.data)
        if (res.data.running) startPolling()
      })
      .catch(() => {})
      .finally(() => setStatusLoading(false))
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const handleRematchAll = async () => {
    try {
      const res = await axios.post<{ queued: number; done?: number; status: string }>('/api/reconciliation/rematch-skipped')
      if (res.data.status === 'already_running') {
        showToast(`Job already running — ${res.data.done ?? 0}/${res.data.queued} done. Watch progress in the button.`)
        startPolling()
      } else if (res.data.status === 'nothing_to_process') {
        showToast('No ESCALATED records to process.')
      } else {
        showToast(`LLM batch started on ${res.data.queued.toLocaleString()} invoices. Progress shown in the button.`)
        startPolling()
      }
    } catch {
      showToast('Batch LLM rematch failed — check backend logs.')
    }
  }

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const isEscalated = selected?.status === 'ESCALATED'
  const matchedPayment = candidates.find(p => p.payment_id === selected?.matched_payment_id)

  return (
    <>
      <PageHeader
        title="Reconciliation"
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!statusLoading && (statusCounts['ESCALATED'] ?? 0) > 0 && !jobStatus?.running && (
              <button
                onClick={handleRematchAll}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 'var(--radius-md)',
                  border: 'none', cursor: 'pointer',
                  background: 'var(--color-warning)', color: '#fff',
                  fontSize: 12, fontWeight: 700,
                }}
              >
                <span style={{ fontSize: 13 }}>⚡</span>
                Run LLM on All Skipped ({(statusCounts['ESCALATED'] ?? 0).toLocaleString()})
              </button>
            )}
            <span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>
              {Object.keys(statusCounts).length > 0
                ? Object.values(statusCounts).reduce((a, b) => a + b, 0).toLocaleString()
                : total.toLocaleString()
              } total records
            </span>
          </div>
        }
      />

      {/* Status filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map(s => {
          const count = s === 'ALL'
            ? Object.values(statusCounts).reduce((a, b) => a + b, 0)
            : (statusCounts[s] ?? null)
          const active = statusFilter === s
          return (
            <button key={s} onClick={() => handleFilter(s)} style={{
              padding: '5px 14px', borderRadius: 'var(--radius-xl)', border: '1px solid',
              borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
              background: active ? 'var(--color-primary-light)' : 'transparent',
              color: active ? 'var(--color-primary)' : 'var(--color-text-2)',
              fontWeight: active ? 700 : 400, fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              {s === 'ALL' ? 'All' : s.replace(/_/g, ' ')}
              {count != null && count > 0 && (
                <span style={{
                  background: active ? 'var(--color-primary)' : 'var(--color-border)',
                  color: active ? '#fff' : 'var(--color-text-2)',
                  borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700,
                }}>
                  {count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* LLM batch progress banner */}
      {jobStatus?.running && (() => {
        const pct = jobStatus.total > 0 ? Math.round((jobStatus.done / jobStatus.total) * 100) : 0
        const eta = jobStatus.eta_s
        return (
          <div style={{
            marginBottom: 'var(--space-md)',
            background: 'var(--color-warning-light)',
            border: '1px solid var(--color-warning)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="spin" style={{ display: 'inline-block' }}>⚡</span>
                LLM Batch Running
              </span>
              <span style={{ fontSize: 12, color: 'var(--color-warning)' }}>
                {jobStatus.done.toLocaleString()} / {jobStatus.total.toLocaleString()} invoices
                {eta != null && ` — ~${Math.ceil(eta / 60)}m remaining`}
              </span>
            </div>
            <div style={{ height: 10, background: 'rgba(0,0,0,0.1)', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 5,
                background: 'var(--color-warning)',
                width: `${pct}%`,
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--color-warning)', marginTop: 4 }}>
              {pct}% complete
            </div>
          </div>
        )
      })()}

      {/* Split pane */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 'var(--space-md)', alignItems: 'start' }}>

        {/* Left: invoice list */}
        <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-3)', fontSize: 13 }}>Loading…</div>
          ) : records.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-3)', fontSize: 13 }}>No records</div>
          ) : records.map(r => (
            <div key={r.invoice_id} onClick={() => selectInvoice(r)} style={{
              padding: '12px var(--space-md)', borderBottom: '1px solid var(--color-border)',
              cursor: 'pointer',
              background: selected?.invoice_id === r.invoice_id ? 'var(--color-primary-light)' : 'transparent',
              transition: 'background 0.1s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <code style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{r.invoice_id}</code>
                <StatusBadge status={r.status} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{r.customer}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{r.merchant}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{fmt(r.amount)}</span>
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px var(--space-md)', borderTop: '1px solid var(--color-border)' }}>
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                style={{ background: 'none', border: 'none', cursor: page === 1 ? 'default' : 'pointer', color: page === 1 ? 'var(--color-text-3)' : 'var(--color-primary)', fontSize: 12, fontWeight: 600 }}>
                ← Prev
              </button>
              <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                style={{ background: 'none', border: 'none', cursor: page >= totalPages ? 'default' : 'pointer', color: page >= totalPages ? 'var(--color-text-3)' : 'var(--color-primary)', fontSize: 12, fontWeight: 600 }}>
                Next →
              </button>
            </div>
          )}
        </div>

        {/* Right: detail panel */}
        {selected ? (
          <div>
            {/* Invoice card */}
            <Card title="Invoice" accent="var(--color-primary)">
              <InfoRow label="Invoice ID" value={<code style={{ fontSize: 12 }}>{selected.invoice_id}</code>} />
              <InfoRow label="Merchant" value={selected.merchant} />
              <InfoRow label="Customer" value={selected.customer} />
              <InfoRow label="Amount" value={<strong>{fmt(selected.amount)}</strong>} />
              <InfoRow label="Invoice Date" value={selected.invoice_date} />
              <InfoRow label="Due Date" value={selected.due_date} />
            </Card>

            {/* Escalated: show all candidates with action buttons */}
            {isEscalated ? (
              <Card
                title={`Candidate Payments from Store (${candidates.length})`}
                accent="var(--color-warning)"
              >
                {selected.reasoning === 'skipped-llm-bulk-load' && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    marginBottom: 12, padding: '10px 12px',
                    background: 'var(--color-warning-light)', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-warning)',
                  }}>
                    <span style={{ fontSize: 12, color: 'var(--color-warning)', flex: 1 }}>
                      LLM was skipped during bulk load. Run it now to auto-resolve, or match manually below.
                    </span>
                    <button
                      onClick={handleRematch}
                      disabled={rematching}
                      style={{
                        padding: '6px 14px', borderRadius: 'var(--radius-md)',
                        border: 'none', cursor: rematching ? 'not-allowed' : 'pointer',
                        background: rematching ? 'var(--color-border)' : 'var(--color-warning)',
                        color: rematching ? 'var(--color-text-3)' : '#fff',
                        fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <span className={rematching ? 'spin' : ''} style={{ fontSize: 13 }}>⚡</span>
                      {rematching ? 'Running LLM…' : 'Run LLM Match'}
                    </button>
                  </div>
                )}
                <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 12 }}>
                  {selected.reasoning === 'skipped-llm-bulk-load'
                    ? 'Or select a candidate payment below to reconcile manually.'
                    : 'Ollama confidence was too low to auto-match. Review the candidates below and reconcile manually.'}
                </p>
                <CandidatePayments
                  invoice={selected}
                  payments={candidates}
                  loading={candidatesLoading}
                  onMatch={(pay, status) => openModal(selected, pay, status)}
                />
              </Card>
            ) : (
              /* Non-escalated: show the single matched payment */
              <Card
                title={selected.matched_payment_id ? 'Matched Payment' : 'No Payment Match'}
                accent={selected.matched_payment_id ? 'var(--color-success)' : 'var(--color-text-3)'}
              >
                {selected.matched_payment_id ? (
                  matchedPayment ? (
                    <>
                      <InfoRow label="Payment ID" value={<code style={{ fontSize: 12 }}>{matchedPayment.payment_id}</code>} />
                      <InfoRow label="Amount Paid" value={<strong style={{ color: 'var(--color-success)' }}>{fmt(matchedPayment.amount_paid)}</strong>} />
                      <InfoRow label="Method" value={`${METHOD_ICON[matchedPayment.method] ?? ''} ${matchedPayment.method}`} />
                      <InfoRow label="Payment Date" value={matchedPayment.payment_date} />
                      {matchedPayment.reference && (
                        <InfoRow label="Reference" value={<code style={{ fontSize: 12 }}>{matchedPayment.reference}</code>} />
                      )}
                      <KafkaPayload payload={matchedPayment.raw_kafka_payload} />
                    </>
                  ) : (
                    <div>
                      <InfoRow label="Payment ID" value={<code style={{ fontSize: 12 }}>{selected.matched_payment_id}</code>} />
                      {selected.payment_amount_paid != null && <InfoRow label="Amount Paid" value={<strong style={{ color: 'var(--color-success)' }}>{fmt(selected.payment_amount_paid)}</strong>} />}
                      {selected.payment_method && <InfoRow label="Method" value={`${METHOD_ICON[selected.payment_method] ?? ''} ${selected.payment_method}`} />}
                      {selected.payment_date && <InfoRow label="Payment Date" value={selected.payment_date} />}
                    </div>
                  )
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--color-text-3)', padding: '8px 0' }}>
                    No payment matched. Invoice is outstanding.
                  </p>
                )}
              </Card>
            )}

            {/* Match analysis */}
            <Card title="Match Analysis" accent={
              selected.confidence >= 0.75 ? 'var(--color-success)'
              : selected.confidence >= 0.5 ? 'var(--color-warning)'
              : 'var(--color-error)'
            }>
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-3)' }}>Status</span>
                  <StatusBadge status={selected.status} />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-3)' }}>
                    Confidence {selected.confidence === 1.0 ? '(human-verified)' : '(Ollama)'}
                  </span>
                </div>
                <ConfidenceBar value={selected.confidence} />
              </div>

              <InfoRow label="Due Amount" value={
                <strong style={{ color: selected.due_amount > 0 ? 'var(--color-error)' : 'var(--color-success)' }}>
                  {fmt(selected.due_amount)}
                </strong>
              } />

              {selected.reasoning && (
                <div style={{ marginTop: 'var(--space-sm)' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-3)', marginBottom: 6 }}>
                    Reasoning
                  </p>
                  <p style={{
                    fontSize: 13, color: selected.reasoning === 'skipped-llm-bulk-load' ? 'var(--color-warning)' : 'var(--color-text-2)',
                    background: 'var(--color-bg)', borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-sm) var(--space-md)',
                    lineHeight: 1.6,
                    borderLeft: `3px solid ${selected.reasoning === 'skipped-llm-bulk-load' ? 'var(--color-warning)' : 'var(--color-primary)'}`,
                  }}>
                    {selected.reasoning === 'skipped-llm-bulk-load'
                      ? 'LLM matching was skipped during bulk data load. Candidate payments exist but could not be auto-matched — please review manually.'
                      : selected.reasoning}
                  </p>
                </div>
              )}
            </Card>
          </div>
        ) : (
          <div style={{
            background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', minHeight: 300, color: 'var(--color-text-3)', fontSize: 13,
          }}>
            Select an invoice from the list to view reconciliation details
          </div>
        )}
      </div>

      {/* Manual reconcile modal */}
      {modal && (
        <ConfirmModal
          modal={modal}
          onConfirm={confirmReconcile}
          onCancel={() => !saving && setModal(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: 'var(--color-text)', color: 'white',
          padding: '10px 20px', borderRadius: 'var(--radius-lg)',
          fontSize: 13, fontWeight: 600, boxShadow: 'var(--shadow-lg)',
          zIndex: 3000, animation: 'fadeIn 0.2s ease',
        }}>
          {toast}
        </div>
      )}

      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </>
  )
}
