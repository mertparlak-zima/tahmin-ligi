// Debug v2: RouterView davranisi — direkt URL vs nav click.
import { chromium } from 'playwright'

const BASE = 'http://localhost:8787'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

const errors = []
page.on('pageerror', err => errors.push(String(err)))

// 1) Direkt URL yuklemeleri
for (const [path, sel] of [
  ['/puan-durumu', '.standings-page'],
  ['/gecmis', '.results-page'],
  ['/tahminlerim', '.mypage, .identity-grid, .empty'],
]) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  console.log(`direkt ${path}: ${sel} = ${await page.locator(sel).count()} | hata: ${errors.length}`)
}

// 2) Ana sayfadan nav click
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
console.log('ana sayfa yuklendi, match-row:', await page.locator('.match-row').count())

const links = page.locator('.nav-item')
console.log('nav link sayisi:', await links.count())
await links.nth(1).click()
await page.waitForTimeout(1500)
console.log('nav click sonrasi url:', page.url())
const pageHtml = await page.locator('main.page').innerHTML()
console.log('main.page icerik (ilk 400):', pageHtml.slice(0, 400))
console.log('standings-page:', await page.locator('.standings-page').count(), '| hata:', errors.length)
errors.slice(0, 3).forEach(e => console.log('HATA:', e.slice(0, 200)))

await browser.close()
