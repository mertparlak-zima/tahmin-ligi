// Gizli text düğümü + prop geçişi probe'u.
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage()
page.on('console', msg => { if (msg.text().includes('crest')) console.log('SAYFA:', msg.text()) })
await page.goto('http://localhost:8787', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
const chip = page.locator('.date-chip').filter({ has: page.locator('.date-count, .date-live-dot') }).first()
await chip.click()
await page.waitForTimeout(700)

const probe = await page.evaluate(() => {
  const crest = document.querySelector('.match-row .crest')
  const img = crest?.querySelector('.crest-img')
  return {
    html: crest ? crest.outerHTML : 'YOK',
    hiddenText: crest?.querySelector('.crest-src')?.textContent ?? '-',
    initials: crest?.querySelector('.crest-initials')?.textContent ?? '-',
    imgSrc: img?.getAttribute('src')?.slice(0, 60) ?? '-',
    imgSrcProp: (img?.src ?? '').slice(0, 60),
    dataSrcDebug: img?.getAttribute('data-src-debug')?.slice(0, 60) ?? '-',
  }
})
console.log('imgSrc attr:', probe.imgSrc)
console.log('imgSrc prop:', probe.imgSrcProp)
console.log('dataSrcDebug:', probe.dataSrcDebug)
const imgTest = await page.evaluate(async () => {
  const results = []
  const urls = [
    'https://a.espncdn.com/i/teamlogots/soccer/500/2250.png',
    'https://a.espncdn.com/i/teamlogos/soccer/500/2250.png',
  ]
  for (const u of urls) {
    const outcome = await new Promise(resolve => {
      const im = new Image()
      im.onload = () => resolve('OK ' + im.naturalWidth + 'x' + im.naturalHeight)
      im.onerror = () => resolve('ERROR')
      im.src = u
      setTimeout(() => resolve('TIMEOUT'), 8000)
    })
    let httpStatus = '-'
    try {
      const res = await fetch(u, { method: 'GET' })
      httpStatus = String(res.status)
    } catch (e) { httpStatus = 'FETCH_ERR' }
    results.push(`${u.slice(-25)} -> img:${outcome} http:${httpStatus}`)
  }
  return results
})
imgTest.forEach(r => console.log(r))
await browser.close()
