// Logo doğrulaması: .crest-img görünür ve yüklenmiş olmalı.
import { chromium } from 'playwright'

const BASE = process.env.BROWSER_CHECK_URL || 'http://localhost:8787'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)

// maçlı güne git
const chip = page.locator('.date-chip').filter({ has: page.locator('.date-count, .date-live-dot') }).first()
if (await chip.count() > 0) await chip.click()
await page.waitForTimeout(600)

const imgs = await page.locator('.match-row .crest-img').count()
const loaded = await page.evaluate(() =>
  [...document.querySelectorAll('.match-row .crest-img')].filter(
    i => i.complete && i.naturalWidth > 0
  ).length
)
const initials = await page.locator('.match-row .crest-initials').count()
console.log(`crest-img: ${imgs} | yuklenmis: ${loaded} | fallback bas-harf: ${initials}`)

// sheet icinde de kontrol
const row = page.locator('.match-row').first()
if (await row.count() > 0) {
  await row.click()
  await page.waitForTimeout(600)
  const sheetImgs = await page.evaluate(() =>
    [...document.querySelectorAll('.sheet .crest-img')].filter(
      i => i.complete && i.naturalWidth > 0
    ).length
  )
  console.log(`sheet crest yuklenmis: ${sheetImgs}`)
}

await browser.close()
