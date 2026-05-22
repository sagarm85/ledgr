import { test, expect } from '@playwright/test'
import path from 'path'

const SS = (name: string) => path.join('/tmp/ledgr-demo', `${name}.png`)

test.use({ viewport: { width: 1440, height: 900 } })

async function waitForSearchDone(page: any) {
  // Wait for Search button to be re-enabled (Ollama finished + table rendered)
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('button') as HTMLButtonElement
      return btn && !btn.disabled && btn.textContent?.trim() === 'Search'
    },
    { timeout: 90_000 }
  )
  await page.waitForTimeout(800)
}

test.setTimeout(300_000) // 5 min — Ollama can be slow on first warm-up

test('full demo journey', async ({ page }) => {
  // ── Dashboard ────────────────────────────────────────────────────────────────
  await page.goto('http://localhost:3002')
  // Wait for KPI cards to populate (analytics API returns fast from CH)
  await page.waitForSelector('text=Total Invoices', { timeout: 20_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: SS('01-dashboard'), fullPage: false })

  // ── Invoices — default view ───────────────────────────────────────────────────
  await page.click('text=Invoices')
  await page.waitForSelector('table', { timeout: 90_000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: SS('02-invoices-default'), fullPage: false })

  // ── Invoices — search "unpaid" ────────────────────────────────────────────────
  await waitForSearchDone(page)
  await page.fill('input[placeholder*="Search"]', 'unpaid invoices')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  await page.screenshot({ path: SS('03-invoices-searching'), fullPage: false })
  // Wait for Ollama to parse + ES to return results
  await waitForSearchDone(page)
  await page.screenshot({ path: SS('03-invoices-search-unpaid'), fullPage: false })

  // ── Invoices — click a row to open detail drawer ───────────────────────────────
  await page.fill('input[placeholder*="Search"]', 'all invoices')
  await page.keyboard.press('Enter')
  await waitForSearchDone(page)
  const firstRow = page.locator('table tbody tr').first()
  await firstRow.click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: SS('04-invoices-row-detail'), fullPage: false })

  // ── Data Flow ─────────────────────────────────────────────────────────────────
  await page.click('text=Data Flow')
  await page.waitForSelector('text=Kafka Ingest', { timeout: 15_000 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: SS('05-dataflow'), fullPage: false })

  // ── Reports ───────────────────────────────────────────────────────────────────
  await page.click('text=Reports')
  await page.waitForSelector('text=Invoice Status Distribution', { timeout: 20_000 })
  await page.waitForTimeout(2000) // let recharts animate
  await page.screenshot({ path: SS('06-reports'), fullPage: false })

  // Scroll to summary table
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(600)
  await page.screenshot({ path: SS('07-reports-summary'), fullPage: false })
})
