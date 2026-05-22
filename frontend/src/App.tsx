import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Invoices from './pages/Invoices'
import DataFlow from './pages/DataFlow'
import Reports from './pages/Reports'
import Payments from './pages/Payments'
import Reconciliation from './pages/Reconciliation'
import LLMMonitor from './pages/LLMMonitor'

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: 'var(--space-lg)', overflow: 'auto' }}>
          <Routes>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/invoices"  element={<Invoices />} />
            <Route path="/payments"        element={<Payments />} />
            <Route path="/reconciliation" element={<Reconciliation />} />
            <Route path="/llm-monitor"    element={<LLMMonitor />} />
            <Route path="/dataflow"       element={<DataFlow />} />
            <Route path="/reports"        element={<Reports />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
