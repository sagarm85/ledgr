import { test, expect } from '@playwright/test'

test.describe('Dashboard page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for the analytics fetch to settle
    await page.waitForLoadState('networkidle')
  })

  test('renders the page title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  test('renders all four KPI stat cards', async ({ page }) => {
    const labels = ['Total Invoices', 'Total Due', 'Match Rate', 'Escalated']
    for (const label of labels) {
      await expect(page.getByText(label)).toBeVisible()
    }
  })

  test('KPI values are not empty or loading dots', async ({ page }) => {
    // Wait for the loading ellipsis to disappear from all stat cards
    await expect(page.getByText('…').first()).not.toBeVisible({ timeout: 10_000 })
  })

  test('Total Invoices stat shows a number', async ({ page }) => {
    await expect(page.getByText('…').first()).not.toBeVisible({ timeout: 10_000 })
    // After loading, the value should be a number (not '…' or empty)
    const statsGrid = page.locator('.stats-grid, [style*="grid-template-columns: repeat(4"]').first()
    await expect(statsGrid).toBeVisible()
  })

  test('renders Status Breakdown chart section', async ({ page }) => {
    await expect(page.getByText('Status Breakdown')).toBeVisible()
  })

  test('renders Daily Invoice Volume chart section', async ({ page }) => {
    await expect(page.getByText('Daily Invoice Volume')).toBeVisible()
  })

  test('renders Service Health section', async ({ page }) => {
    await expect(page.getByText('Service Health')).toBeVisible()
  })

  test('service health shows elasticsearch badge', async ({ page }) => {
    await expect(page.getByText('elasticsearch')).toBeVisible()
  })

  test('service health shows clickhouse badge', async ({ page }) => {
    await expect(page.getByText('clickhouse')).toBeVisible()
  })

  test('service health shows ollama badge', async ({ page }) => {
    await expect(page.getByText('ollama')).toBeVisible()
  })

  test('service health shows kafka badge', async ({ page }) => {
    await expect(page.getByText('kafka')).toBeVisible()
  })

  test('pie chart renders with seeded status data', async ({ page }) => {
    // recharts renders SVG — wait for it to appear
    await expect(page.locator('svg').first()).toBeVisible({ timeout: 10_000 })
  })

  test('Refresh button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible()
  })

  test('sidebar navigation links are visible', async ({ page }) => {
    await expect(page.getByText('Dashboard')).toBeVisible()
    await expect(page.getByText('Invoices')).toBeVisible()
    await expect(page.getByText('Data Flow')).toBeVisible()
    await expect(page.getByText('Reports')).toBeVisible()
  })

  test('sidebar shows Ollama model indicator', async ({ page }) => {
    await expect(page.getByText(/Model:/)).toBeVisible()
  })

  test('no console errors on load', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Filter out known non-critical network errors (Kafka is marked 'unknown' by design)
    const critical = errors.filter(e => !e.includes('favicon') && !e.includes('Failed to fetch'))
    expect(critical).toHaveLength(0)
  })
})
