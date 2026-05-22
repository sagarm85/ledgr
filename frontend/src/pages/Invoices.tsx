import { useState, useEffect } from 'react'
import axios from 'axios'
import SearchBar from '../components/SearchBar'
import InvoiceTable from '../components/InvoiceTable'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import { InvoiceRecord, SearchResponse } from '../api'

const PAGE_SIZE = 100
const STATUS_OPTIONS = ['ALL', 'FULLY_PAID', 'PARTIALLY_PAID', 'UNPAID', 'ESCALATED']

export default function Invoices() {
  const [query, setQuery]               = useState('')
  const [invoices, setInvoices]         = useState<InvoiceRecord[]>([])
  const [total, setTotal]               = useState(0)
  const [page, setPage]                 = useState(1)
  const [loading, setLoading]           = useState(false)
  const [selected, setSelected]         = useState<InvoiceRecord | null>(null)
  const [sortBy, setSortBy]             = useState('invoice_date')
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('desc')
  const [statusFilter, setStatusFilter] = useState('')

  const fetchInvoices = async (
    q: string, p: number,
    sb: string, sd: 'asc' | 'desc', sf: string,
  ) => {
    setLoading(true)
    try {
      let res
      if (q.trim() === '') {
        const params: Record<string, string | number> = {
          page: p, size: PAGE_SIZE, sort_by: sb, sort_dir: sd,
        }
        if (sf) params.status = sf
        res = await axios.get<SearchResponse>('/api/invoices', { params })
      } else {
        res = await axios.post<SearchResponse>('/api/invoices/search', {
          query: q, tenant_id: 'DEMO', page: p, size: PAGE_SIZE,
        })
      }
      setInvoices(res.data.invoices)
      setTotal(res.data.total)
    } catch (err) {
      console.error('Search failed', err)
      setInvoices([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInvoices('', 1, sortBy, sortDir, statusFilter)
  }, [])

  const handleSearch = () => {
    setPage(1)
    fetchInvoices(query, 1, sortBy, sortDir, statusFilter)
  }

  const handleSort = (field: string) => {
    if (query.trim()) return
    const newDir = sortBy === field && sortDir === 'desc' ? 'asc' : 'desc'
    setSortBy(field)
    setSortDir(newDir)
    setPage(1)
    fetchInvoices('', 1, field, newDir, statusFilter)
  }

  const handleStatusFilter = (s: string) => {
    const next = s === 'ALL' ? '' : s
    setStatusFilter(next)
    setQuery('')
    setPage(1)
    fetchInvoices('', 1, sortBy, sortDir, next)
  }

  const handlePrev = () => {
    const p = Math.max(1, page - 1)
    setPage(p)
    fetchInvoices(query, p, sortBy, sortDir, statusFilter)
  }

  const handleNext = () => {
    if (page * PAGE_SIZE < total) {
      const p = page + 1
      setPage(p)
      fetchInvoices(query, p, sortBy, sortDir, statusFilter)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const nlActive   = query.trim() !== ''

  return (
    <>
      <PageHeader
        title="Invoices"
        action={
          <span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>
            {total.toLocaleString()} results
          </span>
        }
      />

      <SearchBar value={query} onChange={setQuery} onSearch={handleSearch} loading={loading} />

      {/* Status filter pills — hidden during NL search */}
      {!nlActive && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
          {STATUS_OPTIONS.map(s => {
            const active = (s === 'ALL' && !statusFilter) || s === statusFilter
            return (
              <button key={s} onClick={() => handleStatusFilter(s)} style={{
                padding: '5px 14px', borderRadius: 'var(--radius-xl)', border: '1px solid',
                borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                background: active ? 'var(--color-primary-light)' : 'transparent',
                color: active ? 'var(--color-primary)' : 'var(--color-text-2)',
                fontWeight: active ? 700 : 400, fontSize: 12, cursor: 'pointer',
              }}>
                {s === 'ALL' ? 'All' : s.replace(/_/g, ' ')}
              </button>
            )
          })}
        </div>
      )}

      <InvoiceTable
        invoices={invoices}
        loading={loading}
        onRowClick={setSelected}
        sortBy={nlActive ? undefined : sortBy}
        sortDir={sortDir}
        onSort={nlActive ? undefined : handleSort}
      />

      {total > PAGE_SIZE && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: 'var(--space-md)', padding: 'var(--space-sm) var(--space-md)',
          background: 'var(--color-surface)', borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>
            Page {page} of {totalPages} ({total.toLocaleString()} total)
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <Button size="sm" variant="secondary" onClick={handlePrev} disabled={page === 1}>← Prev</Button>
            <Button size="sm" variant="secondary" onClick={handleNext} disabled={page >= totalPages}>Next →</Button>
          </div>
        </div>
      )}

      {selected && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', maxWidth: 560, width: '90%', boxShadow: 'var(--shadow-lg)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Invoice Detail</h2>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-2)' }}>×</button>
            </div>
            {Object.entries(selected).map(([k, v]) => (
              v != null && (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13 }}>
                  <span style={{ color: 'var(--color-text-3)', fontWeight: 600, textTransform: 'uppercase', fontSize: 11 }}>{k}</span>
                  <span style={{ color: 'var(--color-text)', maxWidth: '60%', textAlign: 'right', wordBreak: 'break-all' }}>{String(v)}</span>
                </div>
              )
            ))}
          </div>
        </div>
      )}
    </>
  )
}
