// Produksiyon logo doğrulaması — birden fazla gün, src + yükleme durumu.
import { chromium } from 'playwright'

const BASE = process.env.BROWSER_CHECK_URL || 'https://tahmin-ligi-one.vercel.app'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const failed = []
page.on('requestfailed', req => failed.push(req.url().slice(0, 80)))

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)

// Birkaç farklı güne gez
const chips = page.locator('.date-chip').filter({ has: page.locator('.date-count, .date-live-dot') })
const total = await chips.count()
console.log(`maçlı gün sayısı: ${total}`)
const checkDays = Math.min(total, 4)
for (let i = 0; i < checkDays; i++) {
  await chips.nth(i).click()
  await page.waitForTimeout(700)
  const info = await page.evaluate(() => {
    const logos = [...document.querySelectorAll('.match-row .crest-logo')]
    return {
      count: logos.length,
      withBg: logos.filter(l => (l.style.backgroundImage || '').includes('espncdn')).length,
      srcs: logos.slice(0, 2).map(l => (l.style.backgroundImage || 'BOS').slice(0, 70)),
    }
  })
  console.log(`gün ${i + 1}: logo-katmani=${info.count} espncdn-bg=${info.withBg} ornek=${info.srcs.join(' | ')}`)
}

console.log('ag istek hatalari:', failed.length)
failed.slice(0, 3).forEach(f => console.log(' ', f))

// deploy edilmis pakette yeni Crest kodu var mi?
const bundleUrl = await page.evaluate(() => {
  const sc = document.querySelector('script[type="module"]')
  return sc ? sc.src : 'yok'
})
console.log('paket:', bundleUrl)
const bundle = await page.evaluate(async url => {
  const res = await fetch(url)
  return await res.text()
}, bundleUrl)
console.log('paket icinde seffaf GIF fallback var mi:', bundle.includes('R0lGODlhAQABAIA'))
console.log('paket icinde koşulsuz crest-img var mi:', bundle.includes('crest-img'))

await browser.close()
