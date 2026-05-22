// src/components/InvoiceTable.tsx

import StatusBadge from './StatusBadge'
import ConfidenceBar from './ConfidenceBar'
import { InvoiceRecord } from '../api'

interface InvoiceTableProps {
  invoices?: InvoiceRecord[]
  loading?: boolean
  onRowClick?: (inv: InvoiceRecord) => void
}

const COLS = ['Invoice ID', 'Tenant', 'Customer', 'Amount', 'Invoice Date', 'Due Date', 'Status', 'Confidence']

export default function InvoiceTable({ invoices = [], loading = false, onRowClick }: InvoiceTableProps) {
  if (loading) return <Skeleton />
  if (!invoices.length) return <Empty />

  return (
    <div style={{
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
      overflow: 'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              {COLS.map(h => (
                <th key={h} style={{
                  padding: '12px 16px', textAlign: 'left',
                  fontSize: 11, fontWeight: 600,
                  color: 'var(--color-text-3)',
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                  whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv, i) => (
              <tr
                key={inv.invoice_id}
                onClick={() => onRowClick?.(inv)}
                style={{
                  borderBottom: '1px solid var(--color-border)',
                  background: i % 2 === 0 ? 'var(--color-surface)' : '#FAFBFC',
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (onRowClick) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--color-primary-light)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = i % 2 === 0 ? 'var(--color-surface)' : '#FAFBFC' }}
              >
                <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{inv.invoice_id}</td>
                <td style={{ padding: '12px 16px', fontSize: 13 }}>{inv.tenant_id}</td>
                <td style={{ padding: '12px 16px', fontSize: 13 }}>{inv.customer}</td>
                <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600 }}>
                  ${Number(inv.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--color-text-2)' }}>{inv.invoice_date}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--color-text-2)' }}>{inv.due_date}</td>
                <td style={{ padding: '12px 16px' }}><StatusBadge status={inv.status} /></td>
                <td style={{ padding: '12px 16px', minWidth: 120 }}><ConfidenceBar value={inv.confidence ?? 0} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{
          height: 48, margin: '1px 0',
          background: i % 2 === 0 ? '#F0F2F5' : '#E4E6EB',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  )
}

function Empty() {
  return (
    <div style={{ textAlign: 'center', padding: 'var(--space-2xl)', color: 'var(--color-text-2)' }}>
      <p style={{ fontSize: 48 }}>📭</p>
      <p style={{ fontWeight: 600, marginTop: 'var(--space-sm)' }}>No invoices found</p>
      <p style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your search or filters</p>
    </div>
  )
}
