import axios from 'axios'

export interface InvoiceRecord {
  invoice_id: string
  tenant_id: string
  merchant: string
  customer: string
  amount: number
  invoice_date: string
  due_date: string
  status: string
  confidence?: number
  matched_payment_id?: string
  due_amount?: number
  reasoning?: string
  source?: string
}

export interface SearchResponse {
  total: number
  invoices: InvoiceRecord[]
  query_parsed?: Record<string, unknown>
}

export interface AnalyticsResponse {
  total_invoices: number
  total_due: number
  match_rate: number
  escalated_rate: number
  status_breakdown: Record<string, number>
  daily_volumes: Array<{ date: string; count: number; amount: number }>
  tenant_id: string
}

export interface HealthResponse {
  status: string
  services: Record<string, string>
}

export interface BacklogStage {
  stage: string
  queued: number
  rate: number
  eta: number
  status: string
}

export interface GenerateRequest {
  tenant_id: string
  invoices: number
  payments: number
  batch_size: number
}

export const api = {
  health: () =>
    axios.get<HealthResponse>('/api/health').then(r => r.data),

  searchInvoices: (query: string, page = 1, size = 50) =>
    axios
      .post<SearchResponse>('/api/invoices/search', { query, tenant_id: 'DEMO', page, size })
      .then(r => r.data),

  getInvoices: (q = 'all invoices', page = 1, size = 50) =>
    axios
      .get<SearchResponse>('/api/invoices', { params: { q, page, size } })
      .then(r => r.data),

  getAnalytics: () =>
    axios.get<AnalyticsResponse>('/api/analytics').then(r => r.data),

  getBacklog: () =>
    axios.get<BacklogStage[]>('/api/monitoring/backlog').then(r => r.data),

  generate: (req: GenerateRequest) =>
    axios.post('/api/generate', req).then(r => r.data),
}
