import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar
} from 'recharts'
import PageHeader from '../components/PageHeader'
import RefreshBar from '../components/RefreshBar'

interface AnalyticsData {
  total_invoices: number
  total_due: number
  match_rate: number
  escalated_rate: number
  status_breakdown: Record<string, number>
  daily_volumes: Array<{ date: string; count: number; total: number }>
  tenant_id: string
}

// Semantic colour map — colour matches meaning, not array position
const STATUS_HEX: Record<string, string> = {
  FULLY_PAID:     '#31A24C',   // green  — paid = good
  PARTIALLY_PAID: '#F57C00',   // orange — partial = caution
  UNPAID:         '#D32F2F',   // red    — unpaid = bad
  ESCALATED:      '#7B1FA2',   // purple — needs review
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

export default function Reports() {
  const navigate = useNavigate()
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const hasData = useRef(false)

  const STATUS_COLORS: Record<string, string> = {
    FULLY_PAID:     'var(--color-success)',
    PARTIALLY_PAID: 'var(--color-warning)',
    UNPAID:         'var(--color-error)',
    ESCALATED:      'var(--color-escalated)',
  }

  const fetchAnalytics = useCallback(async () => {
    if (!hasData.current) setLoading(true)   // spinner only on first load
    try {
      const res = await axios.get<AnalyticsData>('/api/analytics')
      setAnalytics(res.data)
      setLastRefreshed(new Date())
      hasData.current = true
    } catch (err) {
      console.error('Failed to fetch analytics', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  const pieData = analytics
    ? Object.entries(analytics.status_breakdown).map(([name, value]) => ({ name, value }))
    : []

  const dailyData = analytics?.daily_volumes.slice().reverse() ?? []

  const formatCurrency = (val: number) => {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`
    if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`
    return `$${val.toFixed(2)}`
  }

  const staticRows = analytics
    ? [
        { metric: 'Total Invoices', value: analytics.total_invoices.toLocaleString(), link: '/invoices' },
        { metric: 'Total Due Amount', value: formatCurrency(analytics.total_due), link: null },
        { metric: 'Match Rate (Fully Paid)', value: `${(analytics.match_rate * 100).toFixed(2)}%`, link: null },
        { metric: 'Escalated Rate', value: `${(analytics.escalated_rate * 100).toFixed(2)}%`, link: '/reconciliation?status=ESCALATED' },
        { metric: 'Tenant ID', value: analytics.tenant_id, link: null },
      ]
    : []

  const statusRows = analytics
    ? Object.entries(analytics.status_breakdown).map(([status, count]) => ({
        metric: STATUS_LABEL[status] ?? status,
        value: count.toLocaleString(),
        status,
        link: `/reconciliation?status=${status}`,
      }))
    : []

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        action={
          <RefreshBar onRefresh={fetchAnalytics} loading={loading} lastRefreshed={lastRefreshed} />
        }
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-2xl)', color: 'var(--color-text-2)' }}>
          Loading analytics…
        </div>
      ) : (
        <>
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
                Invoice Status Distribution
              </p>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={90}
                      labelLine={false}
                      label={renderSliceLabel}
                    >
                      {pieData.map((entry) => <Cell key={entry.name} fill={STATUS_HEX[entry.name] ?? '#999'} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => v.toLocaleString()} />

                    <Legend formatter={(name: string) => STATUS_LABEL[name] ?? name} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-3)' }}>
                  No data yet — run a generate job to see results
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
                Daily Invoice Value (last 30 days)
              </p>
              {dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Area type="monotone" dataKey="total" stroke="#1877F2" fill="#E7F3FF" name="Total Value" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-3)' }}>
                  No data yet — run a generate job to see results
                </div>
              )}
            </div>
          </div>

          {/* Daily Count Bar Chart */}
          {dailyData.length > 0 && (
            <div style={{
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-lg)',
              boxShadow: 'var(--shadow-sm)',
              marginBottom: 'var(--space-lg)',
            }}>
              <p style={{ fontWeight: 600, marginBottom: 'var(--space-md)', fontSize: 15 }}>
                Daily Invoice Count (last 30 days)
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#1877F2" name="Invoices" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Summary Table */}
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
          }}>
            <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '2px solid var(--color-border)' }}>
              <p style={{ fontWeight: 600, fontSize: 15 }}>Summary Statistics</p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {staticRows.map(({ metric, value, link }) => (
                  <tr
                    key={metric}
                    onClick={() => link && navigate(link)}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      cursor: link ? 'pointer' : 'default',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (link) e.currentTarget.style.background = 'var(--color-bg)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={{ padding: '12px 24px', fontSize: 13, color: 'var(--color-text-2)', width: '60%' }}>
                      {metric}
                    </td>
                    <td style={{ padding: '12px 24px', fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                        {value}
                        {link && <span style={{ fontSize: 12, color: 'var(--color-primary)' }}>→</span>}
                      </span>
                    </td>
                  </tr>
                ))}

                {/* Status count rows — coloured + clickable */}
                {statusRows.map(({ metric, value, status, link }) => (
                  <tr
                    key={metric}
                    onClick={() => navigate(link)}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'var(--color-bg)'
                      const label = e.currentTarget.querySelector<HTMLElement>('.row-label')
                      if (label) label.style.textDecoration = 'underline'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent'
                      const label = e.currentTarget.querySelector<HTMLElement>('.row-label')
                      if (label) label.style.textDecoration = 'none'
                    }}
                  >
                    <td style={{ padding: '12px 24px', fontSize: 13 }}>
                      <span style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: STATUS_COLORS[status] ?? 'var(--color-text-3)',
                        marginRight: 8,
                      }} />
                      <span
                        className="row-label"
                        style={{ color: STATUS_COLORS[status] ?? 'var(--color-text)', fontWeight: 500 }}
                      >
                        {metric}
                      </span>
                    </td>
                    <td style={{ padding: '12px 24px', fontSize: 14, fontWeight: 700, color: STATUS_COLORS[status] ?? 'var(--color-text)', textAlign: 'right' }}>
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
