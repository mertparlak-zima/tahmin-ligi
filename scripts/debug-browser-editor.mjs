// Admin Tahminler editörü debug: login olup DOM'u ve hataları döker.
// Kullanım: node --env-file=.env scripts/debug-browser-editor.mjs
import { chromium } from 'playwright'

const BASE = process.env.BROWSER_CHECK_URL || 'http://localhost:8787'
const PASSWORD = process.env.ADMIN_PASSWORD

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errs = []
page.on('pageerror', err => errs.push(String(err)))
page.on('console', msg => {
  if (msg.type() === 'error') errs.push('console: ' + msg.text())
})

await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(800)
await page.locator('.admin-login-card input[type="password"]').fill(PASSWORD)
await page.locator('.admin-login-card .btn').click()
await page.waitForTimeout(3000)

console.log('pageerror/console:', errs.length)
errs.slice(0, 6).forEach(e => console.log('  ERR:', e.slice(0, 300)))
console.log('admin-tabs:', await page.locator('.admin-tabs').count())
console.log('admin-preds:', await page.locator('.admin-preds').count())
console.log('admin-day:', await page.locator('.admin-day').count())
console.log('editor-row:', await page.locator('.editor-row').count())
console.log('comp-select:', await page.locator('.comp-select').count())
console.log('comp-select options:', await page.locator('.comp-select option').count())
console.log('seg-item:', await page.locator('.seg-item').count())
console.log('empty:', await page.locator('.admin-preds .empty').count())
const emptyText = await page.locator('.admin-preds .empty').first().textContent().catch(() => null)
console.log('empty text:', emptyText)
const predsHtml = await page.locator('.admin-preds').innerHTML().catch(() => null)
console.log('admin-preds html length:', predsHtml?.length ?? 0)
if (predsHtml && predsHtml.length < 2500) console.log(predsHtml.slice(0, 2500))
const oneDay = await page.locator('.admin-day').first().innerHTML().catch(() => null)
console.log('--- bir gün içi ---')
console.log(oneDay?.slice(0, 1500))

// Tüm maçlar filtresi
await page.locator('.seg-item', { hasText: 'Tüm maçlar' }).first().click()
await page.waitForTimeout(500)
console.log('--- tüm maçlar ---')
console.log('admin-day:', await page.locator('.admin-day').count())
console.log('editor-row:', await page.locator('.editor-row').count())

await browser.close()
process.exit(0)
