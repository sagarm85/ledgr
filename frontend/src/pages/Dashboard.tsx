import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import StatsCard from '../components/StatsCard'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'

interface AnalyticsData {
  total_invoices: number
  total_due: number
  match_rate: number
  escalated_rate: number
  status_breakdown: Record<string, number>
  daily_volumes: Array<{ date: string; count: number; total: number }>
  tenant_id: string
}

interface ServiceHealth {
  status: string
  services: Record<string, string>
}

const STATUS_COLORS: Record<string, string> = {
  FULLY_PAID:     '#31A24C',
  PARTIALLY_PAID: '#F57C00',
  UNPAID:         '#D32F2F',
  ESCALATED:      '#7B1FA2',
}

const STATUS_LABEL: Record<string, string> = {
  FULLY_PAID:     'Fully Paid',
  PARTIALLY_PAID: 'Partially Paid',
  UNPAID:         'Unpaid',
  ESCALATED:      'Escalated',
}

const RADIAN = Math.PI / 180
const renderSliceLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
  cx: number; cy: number; midAngle: number
  innerRadius: number; outerRadius: number; percent: number
}) => {
  if (percent < 0.07) return null
  const r = innerRadius + (outerRadius - innerRadius) * 0.55
  const x = cx + r * Math.cos(-midAngle * RADIAN)
  const y = cy + r * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
      fontSize={12} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

export default function Dashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [health, setHealth] = useState<ServiceHealth | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [analyticsRes, healthRes] = await Promise.all([
          axios.get<AnalyticsData>('/api/analytics'),
          axios.get<ServiceHealth>('/api/health'),
        ])
        setAnalytics(analyticsRes.data)
        setHealth(healthRes.data)
      } catch (err) {
        console.error('Failed to fetch dashboard data', err)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  const formatCurrency = (val: number) => {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`
    if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`
    return `$${val.toFixed(2)}`
  }

  const formatPct = (val: number) => `${(val * 100).toFixed(1)}%`

  const pieData = analytics
    ? Object.entries(analytics.status_breakdown).map(([name, value]) => ({ name, value }))
    : []

  const chartData = analytics?.daily_volumes.slice().reverse() ?? []

  return (
    <>
      <PageHeader
        title="Dashboard"
        action={
          <Button size="sm" onClick={() => window.location.reload()}>
            Refresh
          </Button>
        }
      />

      {/* Stats Grid */}
      <div className="stats-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-lg)',
      }}>
        <StatsCard
          label="Total Invoices"
          value={loading ? '…' : (analytics?.total_invoices ?? 0).toLocaleString()}
          color="primary"
        />
        <StatsCard
          label="Total Due"
          value={loading ? '…' : formatCurrency(analytics?.total_due ?? 0)}
          color="error"
          subtitle="Across all tenants"
        />
        <StatsCard
          label="Match Rate"
          value={loading ? '…' : formatPct(analytics?.match_rate ?? 0)}
          color="success"
          subtitle="Ollama confidence ≥0.75"
        />
        <StatsCard
          label="Escalated"
          value={loading ? '…' : formatPct(analytics?.escalated_rate ?? 0)}
          color="warning"
          subtitle="Manual review needed"
        />
      </div>

      {/* Charts Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-lg)',
      }}>
        {/* Status Pie */}
        <div style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-lg)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={{ fontWeight: 600, marginBottom: 'var(--space-md)', fontSize: 15 }}>
            Status Breakdown
          </p>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={88}
                  labelLine={false}
                  label={renderSliceLabel}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? '#9E9E9E'} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, name: string) => [v.toLocaleString(), STATUS_LABEL[name] ?? name]}
                />
                <Legend
                  iconSize={10}
                  formatter={(name: string) => STATUS_LABEL[name] ?? name}
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-3)' }}>
              {loading ? 'Loading…' : 'No data yet — run a generate job'}
            </div>
          )}
        </div>

        {/* Daily Volume Area Chart */}
        <div style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-lg)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={{ fontWeight: 600, marginBottom: 'var(--space-md)', fontSize: 15 }}>
            Daily Invoice Volume (last 30 days)
          </p>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#1877F2" fill="#E7F3FF" name="Invoices" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-3)' }}>
              {loading ? 'Loading…' : 'No data yet — run a generate job'}
            </div>
          )}
        </div>
      </div>

      {/* Service Health */}
      {health && (
        <div style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-lg)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={{ fontWeight: 600, marginBottom: 'var(--space-md)', fontSize: 15 }}>
            Service Health
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
            {Object.entries(health.services).map(([svc, status]) => (
              <div key={svc} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-xs)',
                padding: '6px 12px',
                borderRadius: 'var(--radius-xl)',
                background: status === 'healthy' ? 'var(--color-success-light)' :
                            status === 'unavailable' ? 'var(--color-error-light)' :
                            'var(--color-warning-light)',
                fontSize: 12,
                fontWeight: 600,
                color: status === 'healthy' ? 'var(--color-success)' :
                       status === 'unavailable' ? 'var(--color-error)' :
                       'var(--color-warning)',
              }}>
                <span>{status === 'healthy' ? '●' : status === 'unavailable' ? '●' : '●'}</span>
                <span>{svc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
