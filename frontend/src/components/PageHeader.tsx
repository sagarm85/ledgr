// src/components/PageHeader.tsx

import { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  action?: ReactNode
}

export default function PageHeader({ title, action = null }: PageHeaderProps) {
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
