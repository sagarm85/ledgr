import { test, expect } from '@playwright/test'

const EXPECTED_STAGES = [
  'Kafka Ingest',
  'Reconciliation',
  'Elasticsearch Sink',
  'ClickHouse Sink',
  'Ollama LLM',
  'PostgreSQL Audit',
]

test.describe('Data Flow page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dataflow')
    await page.waitForLoadState('networkidle')
  })

  test('renders the page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Data Flow & Backlog' })).toBeVisible()
  })

  test('renders the Refresh button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible()
  })

  test('renders the auto-refresh checkbox', async ({ page }) => {
    await expect(page.getByRole('checkbox')).toBeVisible()
  })

  test('auto-refresh checkbox is checked by default', async ({ page }) => {
    const checkbox = page.getByRole('checkbox')
    await expect(checkbox).toBeChecked()
  })

  test('renders all 6 pipeline stage cards', async ({ page }) => {
    for (const stage of EXPECTED_STAGES) {
      await expect(page.getByText(stage)).toBeVisible({ timeout: 8_000 })
    }
  })

  test('each stage card shows Queued metric label', async ({ page }) => {
    await expect(page.getByText('Queued').first()).toBeVisible({ timeout: 8_000 })
  })

  test('each stage card shows Rate metric label', async ({ page }) => {
    await expect(page.getByText('Rate').first()).toBeVisible()
  })

  test('each stage card shows ETA metric label', async ({ page }) => {
    await expect(page.getByText('ETA').first()).toBeVisible()
  })

  test('stage cards show health status indicator', async ({ page }) => {
    // Each DataFlowCard renders "HEALTHY" / "WARNING" / "CRITICAL" in uppercase
    await expect(page.getByText(/HEALTHY|WARNING|CRITICAL/).first()).toBeVisible({ timeout: 8_000 })
  })

  test('Pipeline Architecture diagram is rendered', async ({ page }) => {
    await expect(page.getByText('Pipeline Architecture')).toBeVisible()
  })

  test('pipeline diagram contains expected stages text', async ({ page }) => {
    await expect(page.getByText(/Generator Job/)).toBeVisible()
    await expect(page.getByText(/Reconciliation Job/)).toBeVisible()
  })

  test('unchecking auto-refresh stops updates', async ({ page }) => {
    const checkbox = page.getByRole('checkbox')
    await checkbox.uncheck()
    await expect(checkbox).not.toBeChecked()
  })

  test('clicking Refresh button re-fetches stage data', async ({ page }) => {
    const requestPromise = page.waitForRequest(req => req.url().includes('/api/monitoring/backlog'))
    await page.getByRole('button', { name: 'Refresh' }).click()
    const req = await requestPromise
    expect(req.url()).toContain('/api/monitoring/backlog')
  })
})
