import { test, expect } from '@playwright/test'

test.describe('Reports page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/reports')
    await page.waitForLoadState('networkidle')
  })

  // ── Page structure ──────────────────────────────────────────────────────────

  test('renders the page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Reports & Analytics' })).toBeVisible()
  })

  test('renders the Refresh button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible()
  })

  // ── Charts ──────────────────────────────────────────────────────────────────

  test('renders Invoice Status Distribution chart section', async ({ page }) => {
    await expect(page.getByText('Invoice Status Distribution')).toBeVisible({ timeout: 10_000 })
  })

  test('renders Daily Invoice Value chart section', async ({ page }) => {
    await expect(page.getByText('Daily Invoice Value (last 30 days)')).toBeVisible()
  })

  test('renders Daily Invoice Count bar chart section', async ({ page }) => {
    await expect(page.getByText('Daily Invoice Count (last 30 days)')).toBeVisible({ timeout: 10_000 })
  })

  test('recharts SVG elements are rendered (not empty state)', async ({ page }) => {
    await expect(page.locator('svg').first()).toBeVisible({ timeout: 10_000 })
  })

  test('pie chart legend shows status labels', async ({ page }) => {
    // recharts Legend renders status names as text
    const legendText = page.locator('.recharts-legend-item-text')
    await expect(legendText.first()).toBeVisible({ timeout: 10_000 })
  })

  // ── Summary statistics table ────────────────────────────────────────────────

  test('renders Summary Statistics table', async ({ page }) => {
    await expect(page.getByText('Summary Statistics')).toBeVisible({ timeout: 10_000 })
  })

  test('summary table shows Total Invoices row', async ({ page }) => {
    await expect(page.getByText('Total Invoices')).toBeVisible({ timeout: 10_000 })
  })

  test('summary table shows Total Due Amount row', async ({ page }) => {
    await expect(page.getByText('Total Due Amount')).toBeVisible()
  })

  test('summary table shows Match Rate row', async ({ page }) => {
    await expect(page.getByText('Match Rate (Fully Paid)')).toBeVisible()
  })

  test('summary table shows Escalated Rate row', async ({ page }) => {
    await expect(page.getByText('Escalated Rate')).toBeVisible()
  })

  test('summary table shows Tenant ID row', async ({ page }) => {
    await expect(page.getByText('Tenant ID')).toBeVisible()
    await expect(page.getByText('DEMO')).toBeVisible()
  })

  test('summary table shows status count rows for all 4 statuses', async ({ page }) => {
    const statuses = ['FULLY_PAID', 'PARTIALLY_PAID', 'UNPAID', 'ESCALATED']
    for (const status of statuses) {
      await expect(page.getByText(`Count — ${status}`)).toBeVisible()
    }
  })

  // ── Data values ─────────────────────────────────────────────────────────────

  test('match rate value is a percentage', async ({ page }) => {
    // e.g. "35.29%" — verify the format is present
    await expect(page.getByText(/%/).first()).toBeVisible({ timeout: 10_000 })
  })

  test('total due amount contains a dollar sign', async ({ page }) => {
    await expect(page.locator('td').filter({ hasText: /\$/ }).first()).toBeVisible({ timeout: 10_000 })
  })

  test('total invoices count is non-zero after seeding', async ({ page }) => {
    await expect(page.getByText('Total Invoices')).toBeVisible({ timeout: 10_000 })
    // The value cell is the sibling td — verify it's not "0"
    const rows = page.locator('tr').filter({ hasText: 'Total Invoices' })
    const valueCell = rows.locator('td').last()
    const value = await valueCell.textContent()
    expect(value?.trim()).not.toBe('0')
  })

  // ── Refresh ─────────────────────────────────────────────────────────────────

  test('Refresh button triggers a new analytics API call', async ({ page }) => {
    const requestPromise = page.waitForRequest(req => req.url().includes('/api/analytics'))
    await page.getByRole('button', { name: 'Refresh' }).click()
    const req = await requestPromise
    expect(req.url()).toContain('/api/analytics')
  })

  // ── Navigation ──────────────────────────────────────────────────────────────

  test('sidebar is visible on reports page', async ({ page }) => {
    await expect(page.getByText('Reports')).toBeVisible()
  })
})
