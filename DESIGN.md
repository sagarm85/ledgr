# DESIGN.md — UI Design Reference

Meta Design System for the Invoice Reconciliation Dashboard.
All components below are copy-paste ready. No external UI library install needed.

---

## Why Meta Design System

- Facebook-scale tested, production-grade
- WCAG 2.1 AA accessible out of the box
- Dark mode support built in
- Lighter than Material-UI, more complete than Chakra
- No runtime dependencies beyond React

If `@meta-open-source/baseline-components` is unavailable via npm,
use `shadcn/ui` as a drop-in replacement — same design principles.

---

## Install

```bash
# Option A: Meta Baseline (preferred)
npm install @meta-open-source/baseline-components

# Option B: shadcn/ui (if Meta npm unavailable)
npx shadcn-ui@latest init

# Always needed
npm install recharts lucide-react axios
```

---

## Design Tokens — globals.css

Paste once. Use everywhere. Never use raw hex or pixel values in components.

```css
/* src/globals.css */
:root {
  /* Brand */
  --color-primary:       #1877F2;
  --color-primary-light: #E7F3FF;
  --color-success:       #31A24C;
  --color-success-light: #E9F5E9;
  --color-warning:       #F57C00;
  --color-warning-light: #FFF3E0;
  --color-error:         #D32F2F;
  --color-error-light:   #FFEBEE;
  --color-info:          #1565C0;
  --color-escalated:     #7B1FA2;
  --color-escalated-light: #F3E5F5;

  /* Surfaces */
  --color-bg:       #F0F2F5;
  --color-surface:  #FFFFFF;
  --color-border:   #E4E6EB;

  /* Text */
  --color-text:     #1C1E21;
  --color-text-2:   #65676B;
  --color-text-3:   #90949C;

  /* Spacing */
  --space-xs:  4px;
  --space-sm:  8px;
  --space-md:  16px;
  --space-lg:  24px;
  --space-xl:  32px;
  --space-2xl: 48px;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 20px;

  /* Shadow */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.08);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.12);
  --shadow-lg: 0 4px 16px rgba(0,0,0,0.16);

  /* Font */
  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'SF Mono', 'Fira Code', monospace;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font); background: var(--color-bg); color: var(--color-text); }
```

---

## App Shell

```tsx
// src/App.tsx

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Invoices from './pages/Invoices'
import DataFlow from './pages/DataFlow'
import Reports from './pages/Reports'

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: 'var(--space-lg)', overflow: 'auto' }}>
          <Routes>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/invoices"  element={<Invoices />} />
            <Route path="/dataflow"  element={<DataFlow />} />
            <Route path="/reports"   element={<Reports />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
```

---

## Components (Copy-Paste Ready)

### Sidebar

```tsx
// src/components/Sidebar.tsx

const NAV = [
  { icon: '📊', label: 'Dashboard',  path: '/' },
  { icon: '📄', label: 'Invoices',   path: '/invoices' },
  { icon: '📈', label: 'Data Flow',  path: '/dataflow' },
  { icon: '📋', label: 'Reports',    path: '/reports' },
]

export default function Sidebar() {
  const current = window.location.pathname

  return (
    <nav style={{
      width: 220,
      background: 'var(--color-surface)',
      borderRight: '1px solid var(--color-border)',
      padding: 'var(--space-lg) var(--space-sm)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xs)',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: 'var(--space-md)', marginBottom: 'var(--space-sm)' }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-primary)' }}>
          📊 Reconcile
        </p>
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2 }}>
          Ollama · Local · Free
        </p>
      </div>

      {/* Nav items */}
      {NAV.map(({ icon, label, path }) => {
        const active = current === path
        return (
          <a key={path} href={path} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-sm)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: active ? 600 : 400,
            color: active ? 'var(--color-primary)' : 'var(--color-text-2)',
            background: active ? 'var(--color-primary-light)' : 'transparent',
            transition: 'background 0.15s',
          }}>
            <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{icon}</span>
            <span>{label}</span>
          </a>
        )
      })}

      {/* Model indicator */}
      <div style={{
        marginTop: 'auto',
        padding: 'var(--space-sm) var(--space-md)',
        borderTop: '1px solid var(--color-border)',
      }}>
        <p style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
          Model: {process.env.REACT_APP_OLLAMA_MODEL || 'mistral'}
        </p>
      </div>
    </nav>
  )
}
```

### PageHeader

```tsx
// src/components/PageHeader.tsx

export default function PageHeader({ title, action = null }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 'var(--space-lg)',
    }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text)' }}>
        {title}
      </h1>
      {action}
    </div>
  )
}
```

### StatsCard

```tsx
// src/components/StatsCard.tsx
// Usage: <StatsCard label="Total Invoices" value="1,000,000" color="primary" />

const COLOR_MAP = {
  primary: { top: 'var(--color-primary)', bg: 'var(--color-primary-light)' },
  success: { top: 'var(--color-success)', bg: 'var(--color-success-light)' },
  warning: { top: 'var(--color-warning)', bg: 'var(--color-warning-light)' },
  error:   { top: 'var(--color-error)',   bg: 'var(--color-error-light)' },
}

export default function StatsCard({ label, value, subtitle = null, color = 'primary' }) {
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
```

### StatusBadge

```tsx
// src/components/StatusBadge.tsx
// Usage: <StatusBadge status="FULLY_PAID" />

const STATUS = {
  FULLY_PAID:     { label: '✓ Matched',  color: 'var(--color-success)',   bg: 'var(--color-success-light)' },
  PARTIALLY_PAID: { label: '⚠ Partial',  color: 'var(--color-warning)',   bg: 'var(--color-warning-light)' },
  UNPAID:         { label: '✗ Unpaid',   color: 'var(--color-error)',     bg: 'var(--color-error-light)' },
  ESCALATED:      { label: '🔍 Review',  color: 'var(--color-escalated)', bg: 'var(--color-escalated-light)' },
}

export default function StatusBadge({ status }) {
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
```

### ConfidenceBar

```tsx
// src/components/ConfidenceBar.tsx
// Usage: <ConfidenceBar value={0.88} />

export default function ConfidenceBar({ value }) {
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
```

### SearchBar

```tsx
// src/components/SearchBar.tsx
// Usage: <SearchBar value={q} onChange={setQ} onSearch={handleSearch} />

export default function SearchBar({ value, onChange, onSearch, loading = false }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-sm)',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: '10px var(--space-md)',
      boxShadow: 'var(--shadow-sm)',
      marginBottom: 'var(--space-md)',
    }}>
      <span style={{ fontSize: 18, color: 'var(--color-text-3)' }}>🔍</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSearch()}
        placeholder='Search: "overdue invoices from ACME" or "unpaid over $5000"'
        style={{
          flex: 1, border: 'none', outline: 'none',
          fontSize: 14, color: 'var(--color-text)',
          background: 'transparent',
        }}
      />
      <button
        onClick={onSearch}
        disabled={loading}
        style={{
          background: loading ? 'var(--color-text-3)' : 'var(--color-primary)',
          color: 'white', border: 'none',
          borderRadius: 'var(--radius-md)',
          padding: '8px var(--space-md)',
          fontSize: 13, fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s',
        }}
      >
        {loading ? 'Searching...' : 'Search'}
      </button>
    </div>
  )
}
```

### InvoiceTable

```tsx
// src/components/InvoiceTable.tsx

import StatusBadge from './StatusBadge'
import ConfidenceBar from './ConfidenceBar'

const COLS = ['Invoice ID', 'Tenant', 'Customer', 'Amount', 'Invoice Date', 'Due Date', 'Status', 'Confidence']

export default function InvoiceTable({ invoices = [], loading = false, onRowClick }) {
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
                onMouseEnter={e => { if (onRowClick) e.currentTarget.style.background = 'var(--color-primary-light)' }}
                onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? 'var(--color-surface)' : '#FAFBFC' }}
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
                <td style={{ padding: '12px 16px', minWidth: 120 }}><ConfidenceBar value={inv.confidence} /></td>
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
```

### DataFlowCard (Pipeline Stage)

```tsx
// src/components/DataFlowCard.tsx
// Usage: <DataFlowCard stage="Kafka Streams" queued={12400} rate={450} eta={27} status="healthy" />

const STATUS_COLOR = {
  healthy:  'var(--color-success)',
  warning:  'var(--color-warning)',
  critical: 'var(--color-error)',
}

export default function DataFlowCard({ stage, queued, rate, eta, status = 'healthy' }) {
  const color = STATUS_COLOR[status] || 'var(--color-text-2)'
  const progress = Math.max(5, Math.min(100, 100 - (queued / 50000 * 100)))

  return (
    <div style={{
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-md)',
      borderLeft: `4px solid ${color}`,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{stage}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase' }}>{status}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
        {[
          ['Queued', queued?.toLocaleString() ?? '—'],
          ['Rate',   rate ? `${rate}/s` : '—'],
          ['ETA',    eta  ? `${eta}min` : '—'],
        ].map(([k, v]) => (
          <div key={k}>
            <p style={{ fontSize: 10, color: 'var(--color-text-3)', marginBottom: 2 }}>{k}</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{v}</p>
          </div>
        ))}
      </div>

      <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${progress}%`,
          background: color, borderRadius: 3,
          transition: 'width 1s ease',
        }} />
      </div>
    </div>
  )
}
```

### Button

```tsx
// src/components/Button.tsx

const VARIANTS = {
  primary:   { bg: 'var(--color-primary)',  color: 'white', border: 'none' },
  secondary: { bg: 'transparent', color: 'var(--color-text)', border: '1px solid var(--color-border)' },
  danger:    { bg: 'var(--color-error)',    color: 'white', border: 'none' },
}

export default function Button({ children, onClick, variant = 'primary', size = 'md', disabled = false }) {
  const v = VARIANTS[variant]
  const padding = size === 'sm' ? '6px 12px' : '10px 20px'
  const fontSize = size === 'sm' ? 12 : 14

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...v, padding, fontSize,
        fontWeight: 600,
        borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'opacity 0.2s',
        fontFamily: 'var(--font)',
      }}
    >
      {children}
    </button>
  )
}
```

---

## Page Templates

### Dashboard.tsx

```tsx
import StatsCard from '../components/StatsCard'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'

export default function Dashboard() {
  return (
    <>
      <PageHeader title="Dashboard" action={<Button size="sm">Generate Report</Button>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        <StatsCard label="Total Invoices"  value="1,000,000" color="primary" />
        <StatsCard label="Total Due"       value="$2.3M"     color="error"   subtitle="Across all tenants" />
        <StatsCard label="Match Rate"      value="88.4%"     color="success" subtitle="Ollama confidence ≥0.75" />
        <StatsCard label="Escalated"       value="11.6%"     color="warning" subtitle="Manual review needed" />
      </div>

      {/* Charts and activity go here */}
    </>
  )
}
```

### DataFlow.tsx

```tsx
import { useState, useEffect } from 'react'
import DataFlowCard from '../components/DataFlowCard'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'

export default function DataFlow() {
  const [stages, setStages] = useState([])
  const [auto, setAuto] = useState(true)

  const fetch_ = async () => {
    const r = await fetch('/api/monitoring/backlog')
    setStages(await r.json())
  }

  useEffect(() => {
    fetch_()
    if (!auto) return
    const t = setInterval(fetch_, 3000)
    return () => clearInterval(t)
  }, [auto])

  return (
    <>
      <PageHeader
        title="Data Flow & Backlog"
        action={
          <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
            <Button size="sm" variant="secondary" onClick={fetch_}>Refresh</Button>
            <label style={{ fontSize: 13, color: 'var(--color-text-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} style={{ marginRight: 6 }} />
              Auto (3s)
            </label>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-md)' }}>
        {stages.map(s => <DataFlowCard key={s.stage} {...s} />)}
      </div>
    </>
  )
}
```

---

## Charts (Recharts)

```tsx
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
         XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

// Throughput over time
function ThroughputChart({ data }) {
  return (
    <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)' }}>
      <p style={{ fontWeight: 600, marginBottom: 'var(--space-md)' }}>Records / second</p>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="time" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Area type="monotone" dataKey="invoices" stroke="#1877F2" fill="#E7F3FF" name="Invoices/s" />
          <Area type="monotone" dataKey="payments" stroke="#31A24C" fill="#E9F5E9" name="Payments/s" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// Status breakdown
function StatusPie({ data }) {
  const COLORS = ['#31A24C', '#F57C00', '#D32F2F', '#7B1FA2']
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % 4]} />)}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
```

---

## Responsive Rules

```css
/* Paste in globals.css */
@media (max-width: 1024px) {
  .stats-grid  { grid-template-columns: repeat(2, 1fr) !important; }
  .stage-grid  { grid-template-columns: repeat(2, 1fr) !important; }
}
@media (max-width: 640px) {
  .stats-grid  { grid-template-columns: 1fr !important; }
  .stage-grid  { grid-template-columns: 1fr !important; }
  nav          { display: none; }
}
```

---

## Accessibility Rules (Non-Negotiable)

- Use `<button>` not `<div onClick>`
- Every `<img>` has `alt`
- Every icon-only button has `aria-label`
- Minimum tap target: 44×44px
- Never `outline: none` without a replacement focus style
- Color alone never conveys meaning — always pair with text or icon

---

## Component Quick Reference

| Component | File | When to use |
|-----------|------|-------------|
| `StatsCard` | StatsCard.tsx | Top KPI numbers |
| `StatusBadge` | StatusBadge.tsx | Matched / Partial / Unpaid |
| `ConfidenceBar` | ConfidenceBar.tsx | Ollama match confidence |
| `SearchBar` | SearchBar.tsx | NL search input |
| `InvoiceTable` | InvoiceTable.tsx | Main invoice list |
| `DataFlowCard` | DataFlowCard.tsx | Pipeline stage monitoring |
| `Button` | Button.tsx | All clickable actions |
| `Sidebar` | Sidebar.tsx | App navigation |
| `PageHeader` | PageHeader.tsx | Page title + action |
| `ThroughputChart` | inline Recharts | Records/sec over time |
| `StatusPie` | inline Recharts | Status breakdown |
