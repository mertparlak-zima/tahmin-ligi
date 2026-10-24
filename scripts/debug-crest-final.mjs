// Kesin izleme: ilk yükleme, lifecycle log + sonuç src birlikte.
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage()
const logs = []
page.on('console', msg => { if (msg.text().includes('crest')) logs.push(msg.text()) })
await page.goto('http://localhost:8787', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4500)

console.log(`lifecycle log sayisi: ${logs.length}`)
logs.slice(0, 4).forEach(l => console.log(' ', l))

const state = await page.evaluate(() => {
  const crests = [...document.querySelectorAll('.crest')]
  return crests.slice(0, 4).map(c => {
    const img = c.querySelector('.crest-img')
    return {
      initials: c.querySelector('.crest-initials')?.textContent,
      src: (img?.getAttribute('src') ?? '(src yok)').slice(0, 50),
      loaded: img ? img.complete && img.naturalWidth > 1 : false,
    }
  })
})
state.forEach(s => console.log(JSON.stringify(s)))

// ilk maçlı güne tıkla, tekrar bak
const chip = page.locator('.date-chip').filter({ has: page.locator('.date-count, .date-live-dot') }).first()
await chip.click()
await page.waitForTimeout(1200)
console.log('--- tık sonrası lifecycle:', logs.length)
const state2 = await page.evaluate(() => {
  const crests = [...document.querySelectorAll('.match-row .crest')]
  return crests.slice(0, 2).map(c => {
    const img = c.querySelector('.crest-img')
    return {
      src: (img?.getAttribute('src') ?? '(src yok)').slice(0, 50),
      loaded: img ? img.complete && img.naturalWidth > 1 : false,
    }
  })
})
state2.forEach(s => console.log(JSON.stringify(s)))
logs.slice(-2).forEach(l => console.log(' ', l))
await browser.close()
