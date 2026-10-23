// Debug v3: sheet acilisi, gecmis nav, admin girisi — asamali hata yakalama.
import { chromium } from 'playwright'

const BASE = 'http://localhost:8787'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

const errors = []
page.on('pageerror', err => errors.push('pageerror: ' + String(err)))
page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()) })

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)

// maçlı güne git
const chip = page.locator('.date-chip').filter({ has: page.locator('.date-count, .date-live-dot') }).first()
if (await chip.count() > 0) await chip.click()
await page.waitForTimeout(600)
console.log('satir:', await page.locator('.match-row').count())

// satira tikla
const row = page.locator('.match-row').first()
console.log('row bulundu:', await row.count(), '| gorunur:', await row.isVisible())
await row.click({ force: true })
await page.waitForTimeout(800)
console.log('tik sonrasi: sheet-root =', await page.locator('.sheet-root').count(),
  '| body.sheet-open =', await page.evaluate(() => document.body.className))
errors.slice(0, 3).forEach(e => console.log('HATA:', e.slice(0, 250)))

// gecmis
await page.locator('.nav-item').nth(3).click()
await page.waitForTimeout(1500)
console.log('gecmis: url =', page.url(), '| results-page =', await page.locator('.results-page').count(),
  '| empty =', await page.locator('.empty').count())
errors.slice(0, 5).forEach(e => console.log('HATA:', e.slice(0, 250)))

// admin
await page.goto(`${BASE}/admin`)
await page.waitForTimeout(1200)
const input = page.locator('.admin-login-card input[type="password"]')
await input.fill(process.env.ADMIN_PASSWORD)
await page.locator('.admin-login-card .btn').click()
await page.waitForTimeout(3500)
console.log('admin: tabs =', await page.locator('.admin-tabs').count(),
  '| editor-day =', await page.locator('.admin-day').count(),
  '| editor-row =', await page.locator('.editor-row').count())
console.log('toplam hata:', errors.length)
errors.slice(0, 6).forEach(e => console.log('HATA:', e.slice(0, 300)))

await browser.close()
