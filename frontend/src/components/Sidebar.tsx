import { NavLink } from 'react-router-dom'

const NAV = [
  { icon: '📊', label: 'Dashboard',      path: '/' },
  { icon: '📄', label: 'Invoices',       path: '/invoices' },
  { icon: '💳', label: 'Payments',       path: '/payments' },
  { icon: '🔗', label: 'Reconciliation', path: '/reconciliation' },
  { icon: '🤖', label: 'LLM Monitor',    path: '/llm-monitor' },
  { icon: '📈', label: 'Data Flow',      path: '/dataflow' },
  { icon: '📋', label: 'Reports',        path: '/reports' },
]

export default function Sidebar() {
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
      <div style={{ padding: 'var(--space-md)', marginBottom: 'var(--space-sm)' }}>
        <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-primary)', lineHeight: 1.2 }}>
          📊 Ledgr
        </p>
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 4 }}>
          Ollama · Local · Free
        </p>
      </div>

      {NAV.map(({ icon, label, path }) => (
        <NavLink
          key={path}
          to={path}
          end={path === '/'}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-sm)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: isActive ? 600 : 400,
            color: isActive ? 'var(--color-primary)' : 'var(--color-text-2)',
            background: isActive ? 'var(--color-primary-light)' : 'transparent',
            transition: 'background 0.15s',
          })}
        >
          <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{icon}</span>
          <span>{label}</span>
        </NavLink>
      ))}

      <div style={{
        marginTop: 'auto',
        padding: 'var(--space-sm) var(--space-md)',
        borderTop: '1px solid var(--color-border)',
      }}>
        <p style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
          Model: {import.meta.env.VITE_OLLAMA_MODEL || 'mistral'}
        </p>
      </div>
    </nav>
  )
}
