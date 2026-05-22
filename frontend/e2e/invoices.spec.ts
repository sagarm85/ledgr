import { test, expect } from '@playwright/test'

test.describe('Invoices page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/invoices')
    await page.waitForLoadState('networkidle')
  })

  // ── Page structure ──────────────────────────────────────────────────────────

  test('renders the page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible()
  })

  test('renders the search bar', async ({ page }) => {
    await expect(page.getByPlaceholder(/Search/i)).toBeVisible()
  })

  test('search bar has a Search button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Search' })).toBeVisible()
  })

  // ── Table content ───────────────────────────────────────────────────────────

  test('invoice table renders with rows', async ({ page }) => {
    // Wait for the table to appear after initial fetch
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible()
  })

  test('table header has expected columns', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
    const headers = ['Invoice ID', 'Tenant', 'Customer', 'Amount', 'Invoice Date', 'Due Date', 'Status', 'Confidence']
    for (const header of headers) {
      await expect(page.getByText(header)).toBeVisible()
    }
  })

  test('table rows show dollar amounts', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
    // At least one cell should contain a dollar sign
    await expect(page.locator('td').filter({ hasText: /\$/ }).first()).toBeVisible()
  })

  test('result count is shown in page header', async ({ page }) => {
    await expect(page.getByText(/results/)).toBeVisible({ timeout: 10_000 })
  })

  // ── Status badges ───────────────────────────────────────────────────────────

  test('status badges render for fully paid invoices', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('✓ Matched').first()).toBeVisible()
  })

  test('status badges render for unpaid invoices', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('✗ Unpaid').first()).toBeVisible()
  })

  test('status badges render for partially paid invoices', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('⚠ Partial').first()).toBeVisible()
  })

  test('status badges render for escalated invoices', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('🔍 Review').first()).toBeVisible()
  })

  // ── Confidence bar ──────────────────────────────────────────────────────────

  test('confidence bar percentage text renders', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
    // ConfidenceBar renders "XX%" text. 0% for UNPAID, 90%+ for FULLY_PAID.
    await expect(page.getByText(/\d+%/).first()).toBeVisible()
  })

  // ── Search functionality ────────────────────────────────────────────────────

  test('typing in search bar and pressing Enter triggers search', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Search/i)
    await searchInput.fill('unpaid invoices')
    await searchInput.press('Enter')
    await page.waitForLoadState('networkidle')
    // Should still show a table (not error out)
    await expect(page.locator('table, [style*="No invoices found"]')).toBeVisible({ timeout: 10_000 })
  })

  test('clicking Search button triggers search', async ({ page }) => {
    await page.getByPlaceholder(/Search/i).fill('all invoices')
    await page.getByRole('button', { name: 'Search' }).click()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
  })

  test('search for nonexistent query shows empty state', async ({ page }) => {
    await page.getByPlaceholder(/Search/i).fill('XYZZY_INVOICE_THAT_DOES_NOT_EXIST_12345')
    await page.getByRole('button', { name: 'Search' }).click()
    await page.waitForLoadState('networkidle')
    // Either "No invoices found" empty state or total=0 in header
    const emptyState = page.getByText(/No invoices found|0 results/)
    const tableWithRows = page.locator('table tbody tr')
    // One of these must be true
    const hasEmpty = await emptyState.isVisible({ timeout: 8_000 }).catch(() => false)
    const rowCount = await tableWithRows.count()
    expect(hasEmpty || rowCount === 0).toBe(true)
  })

  // ── Row click / detail drawer ───────────────────────────────────────────────

  test('clicking an invoice row opens a detail view', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
    await page.locator('table tbody tr').first().click()
    // Detail drawer should appear — look for reasoning or matched_payment_id labels
    await expect(
      page.getByText(/Reasoning|reasoning|Invoice Detail|Detail/i).first()
    ).toBeVisible({ timeout: 5_000 })
  })

  // ── Pagination ──────────────────────────────────────────────────────────────

  test('pagination controls are visible when there are enough results', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
    const totalText = page.getByText(/results/)
    const totalStr = await totalText.textContent()
    // Only check pagination if total > page size (50)
    if (totalStr && parseInt(totalStr) > 50) {
      await expect(page.getByRole('button', { name: /Next|›/ })).toBeVisible()
    }
  })
})
