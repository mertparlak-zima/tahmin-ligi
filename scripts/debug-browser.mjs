// Hedefli debug: ilk render zamanlaması + sayfa geçişleri + admin.
// Kullanım: node --env-file=.env scripts/debug-browser.mjs

import { chromium } from 'playwright'

const BASE = 'http://localhost:8787'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

const pageErrors = []
page.on('pageerror', err => pageErrors.push(String(err)))
page.on('console', msg => {
  if (msg.type() === 'error') pageErrors.push('console: ' + msg.text())
})

await page.goto(BASE, { waitUntil: 'domcontentloaded' })

for (let i = 1; i <= 8; i++) {
  await page.waitForTimeout(1000)
  const chips = await page.locator('.date-chip').count()
  const groups = await page.locator('.comp-group').count()
  const rows = await page.locator('.match-row').count()
  const selected = await page.locator('.date-chip.selected .date-day').textContent().catch(() => '-')
  console.log(`${i}s: chip=${chips} grup=${groups} satir=${rows} secili=${(await selected)?.trim()}`)
}

await page.screenshot({ path: 'debug-1-matches.png', fullPage: false })
console.log('--- html özeti (matches-page):')
const html = await page.locator('.matches-page').innerHTML().catch(() => 'YOK')
console.log(html.slice(0, 600))

// tarih chip değiştir: en son chip (gelecek tarih)
const chips = page.locator('.date-chip')
const n = await chips.count()
if (n > 0) {
  await chips.nth(n - 1).click()
  await page.waitForTimeout(800)
  console.log('son chip sonrasi satir:', await page.locator('.match-row').count())
}

// nav testi
console.log('--- nav: puan')
await page.locator('.nav-item').nth(1).click()
await page.waitForTimeout(1200)
console.log('url:', page.url(), '| standings-page:', await page.locator('.standings-page').count(), '| hata:', pageErrors.length)

console.log('--- nav: tahminlerim')
await page.locator('.nav-item').nth(2).click()
await page.waitForTimeout(1200)
console.log('url:', page.url(), '| mypage:', await page.locator('.mypage').count(), '| modal:', await page.locator('.identity-grid').count())

console.log('--- nav: geçmiş')
await page.locator('.nav-item').nth(3).click()
await page.waitForTimeout(1200)
console.log('url:', page.url(), '| results-page:', await page.locator('.results-page').count())

// admin
await page.goto(`${BASE}/admin`)
await page.waitForTimeout(1500)
const input = page.locator('.admin-login-card input[type="password"]')
console.log('--- admin login görünüyor:', await input.count())
await input.fill(process.env.ADMIN_PASSWORD)
await page.locator('.admin-login-card .btn').click()
await page.waitForTimeout(3000)
console.log('admin-tabs:', await page.locator('.admin-tabs').count(), '| editor-row:', await page.locator('.editor-row').count(), '| hata sayisi:', pageErrors.length)
pageErrors.slice(0, 5).forEach(e => console.log('HATA:', e.slice(0, 300)))
await page.screenshot({ path: 'debug-2-admin.png' })

await browser.close()
