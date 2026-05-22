// src/components/Button.tsx

import { ReactNode } from 'react'

const VARIANTS: Record<string, { background: string; color: string; border: string }> = {
  primary:   { background: 'var(--color-primary)',  color: 'white', border: 'none' },
  secondary: { background: 'transparent', color: 'var(--color-text)', border: '1px solid var(--color-border)' },
  danger:    { background: 'var(--color-error)',    color: 'white', border: 'none' },
}

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md'
  disabled?: boolean
}

export default function Button({ children, onClick, variant = 'primary', size = 'md', disabled = false }: ButtonProps) {
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
