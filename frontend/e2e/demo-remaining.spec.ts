import { test } from '@playwright/test'
import path from 'path'

const SS = (name: string) => path.join('/tmp/ledgr-demo', `${name}.png`)

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(60_000)

test('dataflow page', async ({ page }) => {
  await page.goto('http://localhost:3002/dataflow')
  await page.waitForSelector('text=Kafka Ingest', { timeout: 15_000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: SS('05-dataflow'), fullPage: false })
})

test('reports page', async ({ page }) => {
  await page.goto('http://localhost:3002/reports')
  await page.waitForSelector('text=Invoice Status Distribution', { timeout: 15_000 })
  await page.waitForTimeout(2200)
  await page.screenshot({ path: SS('06-reports'), fullPage: false })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(600)
  await page.screenshot({ path: SS('07-reports-summary'), fullPage: false })
})

test('dashboard fresh load', async ({ page }) => {
  await page.goto('http://localhost:3002')
  await page.waitForSelector('text=Total Invoices', { timeout: 15_000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: SS('01-dashboard'), fullPage: false })
})
