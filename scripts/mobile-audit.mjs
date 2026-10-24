// #15 Mobil uyum denetimi: tüm akışları 390x844 ve 360x800 viewportlarında
// tarar — yatay sayfa taşması, viewport dışı elemanlar (kaydırılabilir
// atalara sahip olmayanlar), dokunma hedefi boyutları, dock/save-bar
// çakışması; her sayfanın ekran görüntüsünü kaydeder.
//
// Kullanım: node scripts/mobile-audit.mjs [BASE_URL]
// Önkoşul: npm run build + demo sunucu (ör. PORT=8790 node scripts/demo-server.mjs)

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:8790'
const PASSWORD = process.env.ADMIN_PASSWORD || 'demo123'
const OUT = 'D:/development/drive-trace/tmp/opencode/tahmin-mobile-shots'
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '360', width: 360, height: 800 },
]

const findings = []
const note = (vp, flow, kind, detail) => {
  findings.push({ vp, flow, kind, detail })
  console.log(`  [${vp}] ${flow} · ${kind}: ${detail}`)
}

// Sayfa düzeyi taşma + viewport dışı elemanlar (kaydırılabilir ataları hariç).
async function overflowScan(page, vp, flow) {
  const res = await page.evaluate(() => {
    const doc = document.scrollingElement
    const vw = window.innerWidth
    const out = { docOverflow: doc.scrollWidth - vw, els: [] }
    const hasScrollableAncestor = el => {
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const s = getComputedStyle(n)
        if (s.overflowX === 'auto' || s.overflowX === 'scroll') return true
      }
      return false
    }
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      if (cs.position === 'fixed') continue
      if (r.right > vw + 1 || r.left < -1) {
        if (!hasScrollableAncestor(el)) {
          const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className ?? '').trim().split(/\s+/)[0]
          out.els.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} [${Math.round(r.left)}..${Math.round(r.right)}] w=${Math.round(r.width)}`)
        }
      }
    }
    out.els = [...new Set(out.els)].slice(0, 10)
    return out
  })
  if (res.docOverflow > 1) note(vp, flow, 'SAYFA TAŞMASI', `document ${res.docOverflow}px geniş`)
  for (const el of res.els) note(vp, flow, 'VIEWPORT DIŞI', el)
}

// Dokunma hedefleri: bu seçicilerin görünür örneklerinin min yüksekliği.
async function tapScan(page, vp, flow, selectors) {
  for (const sel of selectors) {
    const sizes = await page.evaluate(s => {
      const out = []
      for (const el of document.querySelectorAll(s)) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        out.push({ h: Math.round(r.height), w: Math.round(r.width) })
      }
      return out
    }, sel)
    if (sizes.length === 0) continue
    const minH = Math.min(...sizes.map(s => s.h))
    const minW = Math.min(...sizes.map(s => s.w))
    if (minH < 30 || minW < 30) note(vp, flow, 'DOKUNMA HEDEFİ', `${sel} min ${minW}x${minH}px (<30)`)
  }
}

const TAP_TARGETS = ['.nav-item', '.cal-nav', '.cal-today-btn', '.seg-item', '.comp-select', '.icon-btn', '.admin-link', '.editor-select', '.btn', '.season-picker select']

const browser = await chromium.launch()

for (const vp of VIEWPORTS) {
  console.log(`\n=== ${vp.name}x${vp.height} ===`)
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
  const pageErrors = []
  page.on('pageerror', err => pageErrors.push(String(err)))

  // --- Maçlar + takvim ---
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  if (pageErrors.length) note(vp.name, 'maçlar', 'JS HATASI', pageErrors[0])
  await overflowScan(page, vp.name, 'maçlar')
  await tapScan(page, vp.name, 'maçlar', TAP_TARGETS)
  if (vp.name === '390') await page.screenshot({ path: `${OUT}/01-matches.png` })

  await page.locator('.cal-nav[aria-label="Sonraki ay"]').click()
  await page.waitForTimeout(350)
  await overflowScan(page, vp.name, 'maçlar+ay')
  await page.locator('.cal-nav[aria-label="Önceki ay"]').click()
  await page.waitForTimeout(300)

  const dayWithChip = page.locator('.cal-cell').filter({ has: page.locator('.cal-chip') }).first()
  if (await dayWithChip.count() > 0) await dayWithChip.click()
  await page.waitForTimeout(400)

  // --- Maç detay sheet ---
  const row = page.locator('.match-row').first()
  if (await row.count() > 0) {
    await row.click()
    await page.waitForTimeout(450)
    const sheetFit = await page.evaluate(() => {
      const el = document.querySelector('.sheet')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width), vw: window.innerWidth, h: Math.round(r.height) }
    })
    if (sheetFit && sheetFit.w > sheetFit.vw + 1) note(vp.name, 'sheet', 'TAŞMA', `sheet ${sheetFit.w}px > vw ${sheetFit.vw}`)
    if (vp.name === '390') await page.screenshot({ path: `${OUT}/02-sheet.png` })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  } else {
    note(vp.name, 'sheet', 'ATLANDI', 'maç satırı yok')
  }

  // --- Puan durumu ---
  await page.locator('.nav-item', { hasText: 'Puan' }).first().click()
  await page.waitForTimeout(500)
  await overflowScan(page, vp.name, 'puan-durumu')
  if (vp.name === '390') await page.screenshot({ path: `${OUT}/03-standings.png` })

  // --- Tahminlerim (+ kimlik seçimi) ---
  await page.locator('.nav-item', { hasText: 'Tahminlerim' }).first().click()
  await page.waitForTimeout(500)
  const chip = page.locator('.identity-chip').first()
  if (await chip.count() > 0) {
    await chip.click()
    await page.waitForTimeout(400)
  }
  await overflowScan(page, vp.name, 'tahminlerim')
  if (vp.name === '390') await page.screenshot({ path: `${OUT}/04-mypredictions.png` })

  // --- Geçmiş ---
  await page.locator('.nav-item', { hasText: 'Geçmiş' }).first().click()
  await page.waitForTimeout(500)
  await overflowScan(page, vp.name, 'geçmiş')
  if (vp.name === '390') await page.screenshot({ path: `${OUT}/05-results.png` })

  // --- Admin ---
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  const loginInput = page.locator('.admin-login-card input[type="password"]')
  if (await loginInput.count() > 0) {
    await loginInput.fill(PASSWORD)
    await page.locator('.admin-login-card .btn').click()
    await page.waitForTimeout(2500)
  }
  await overflowScan(page, vp.name, 'admin-editör')
  await tapScan(page, vp.name, 'admin-editör', TAP_TARGETS)
  if (vp.name === '390') await page.screenshot({ path: `${OUT}/06-admin-editor.png` })

  // select değiştir → dirty bar + dock çakışması
  const openSelect = page.locator('.editor-select:not([disabled])').first()
  if (await openSelect.count() > 0) {
    const cur = await openSelect.inputValue()
    await openSelect.selectOption(cur === 'H' ? 'D' : 'H')
    await page.waitForTimeout(400)
    const clash = await page.evaluate(() => {
      const bar = document.querySelector('.save-bar')
      const dock = document.querySelector('.mainnav')
      if (!bar || !dock) return null
      const a = bar.getBoundingClientRect()
      const b = dock.getBoundingClientRect()
      const overlap = a.bottom > b.top + 2 && a.top < b.bottom
      return { overlap, barBottom: Math.round(a.bottom), dockTop: Math.round(b.top) }
    })
    if (clash && clash.overlap) note(vp.name, 'admin-kaydet', 'ÇAKIŞMA', `save-bar (${clash.barBottom}) dock ile örtüşüyor (dock üst: ${clash.dockTop})`)
    if (vp.name === '390') await page.screenshot({ path: `${OUT}/07-admin-dirty.png` })
  }

  for (const tab of ['Oyuncular', 'Puanlama', 'Veri']) {
    await page.locator('.admin-tab', { hasText: tab }).click()
    await page.waitForTimeout(450)
    await overflowScan(page, vp.name, `admin-${tab.toLowerCase()}`)
  }
  if (vp.name === '390') await page.screenshot({ path: `${OUT}/08-admin-data.png` })

  await page.close()
}

await browser.close()

console.log(`\n=== ÖZET: ${findings.length} bulgu ===`)
for (const f of findings) console.log(JSON.stringify(f))
process.exit(findings.length > 0 ? 1 : 0)
