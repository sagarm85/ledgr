// src/components/SearchBar.tsx
// Usage: <SearchBar value={q} onChange={setQ} onSearch={handleSearch} />

interface SearchBarProps {
  value: string
  onChange: (val: string) => void
  onSearch: () => void
  loading?: boolean
}

export default function SearchBar({ value, onChange, onSearch, loading = false }: SearchBarProps) {
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
