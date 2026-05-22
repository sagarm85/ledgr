import { useState, useEffect } from 'react'
import axios from 'axios'
import SearchBar from '../components/SearchBar'
import InvoiceTable from '../components/InvoiceTable'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import { InvoiceRecord, SearchResponse } from '../api'

const PAGE_SIZE = 100

export default function Invoices() {
  const [query, setQuery] = useState('')
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<InvoiceRecord | null>(null)

  const fetchInvoices = async (q: string, p: number) => {
    setLoading(true)
    try {
      let res
      if (q.trim() === '') {
        // Default view: GET endpoint — no Ollama call, instant
        res = await axios.get<SearchResponse>('/api/invoices', {
          params: { page: p, size: PAGE_SIZE },
        })
      } else {
        // NL search: POST endpoint — routes through Ollama
        res = await axios.post<SearchResponse>('/api/invoices/search', {
          query: q,
          tenant_id: 'DEMO',
          page: p,
          size: PAGE_SIZE,
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
    fetchInvoices('', 1)
  }, [])

  const handleSearch = () => {
    setPage(1)
    fetchInvoices(query, 1)
  }

  const handlePrev = () => {
    const newPage = Math.max(1, page - 1)
    setPage(newPage)
    fetchInvoices(query, newPage)
  }

  const handleNext = () => {
    if (page * PAGE_SIZE < total) {
      const newPage = page + 1
      setPage(newPage)
      fetchInvoices(query, newPage)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

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

      <SearchBar
        value={query}
        onChange={setQuery}
        onSearch={handleSearch}
        loading={loading}
      />

      <InvoiceTable
        invoices={invoices}
        loading={loading}
        onRowClick={(inv) => setSelected(inv)}
      />

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 'var(--space-md)',
          padding: 'var(--space-sm) var(--space-md)',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>
            Page {page} of {totalPages} ({total.toLocaleString()} total)
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <Button size="sm" variant="secondary" onClick={handlePrev} disabled={page === 1}>
              ← Prev
            </Button>
            <Button size="sm" variant="secondary" onClick={handleNext} disabled={page >= totalPages}>
              Next →
            </Button>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {selected && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-xl)',
              maxWidth: 560,
              width: '90%',
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Invoice Detail</h2>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-2)' }}
              >
                ×
              </button>
            </div>
            {Object.entries(selected).map(([k, v]) => (
              v != null && (
                <div key={k} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: '1px solid var(--color-border)',
                  fontSize: 13,
                }}>
                  <span style={{ color: 'var(--color-text-3)', fontWeight: 600, textTransform: 'uppercase', fontSize: 11 }}>{k}</span>
                  <span style={{ color: 'var(--color-text)', maxWidth: '60%', textAlign: 'right', wordBreak: 'break-all' }}>
                    {String(v)}
                  </span>
                </div>
              )
            ))}
          </div>
        </div>
      )}
    </>
  )
}
