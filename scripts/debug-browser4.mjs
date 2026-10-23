// Debug v4: sadece Geçmiş ve Admin — hata mesajlarını tam yakala.
import { chromium } from 'playwright'

const BASE = 'http://localhost:8787'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

page.on('pageerror', err => console.log('PAGEERROR:', String(err).slice(0, 400)))
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE:', msg.text().slice(0, 300)) })

await page.goto(`${BASE}/gecmis`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
console.log('gecmis: results-page =', await page.locator('.results-page').count(),
  '| day-group =', await page.locator('.day-group').count(),
  '| result-item =', await page.locator('.result-item').count())

await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
await page.locator('.admin-login-card input[type="password"]').fill(process.env.ADMIN_PASSWORD)
await page.locator('.admin-login-card .btn').click()
await page.waitForTimeout(3000)
console.log('admin: tabs =', await page.locator('.admin-tabs').count(),
  '| admin-preds =', await page.locator('.admin-preds').count(),
  '| admin-day =', await page.locator('.admin-day').count(),
  '| editor-row =', await page.locator('.editor-row').count())
const html = await page.locator('.admin-page').innerHTML().catch(() => 'YOK')
console.log('admin-page html (ilk 300):', html.slice(0, 300))

await browser.close()
