// #17 canlı doğrulama: prod üzerinde gerçek avatar yükleme/kaldırma (UI akışı).
// Kullanım: node --env-file=.env scripts/prod-avatar-check.mjs [BASE]
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'https://tahmin-ligi-one.vercel.app'
const PASSWORD = process.env.ADMIN_PASSWORD
if (!PASSWORD) {
  console.error('ADMIN_PASSWORD gerekli (--env-file=.env)')
  process.exit(1)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const pageErrors = []
page.on('pageerror', err => pageErrors.push(String(err)))

const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(800)
await page.locator('.admin-login-card input[type="password"]').fill(PASSWORD)
await page.locator('.admin-login-card .btn').click()
await page.waitForTimeout(2500)
check('admin girişi', (await page.locator('.admin-tabs').count()) === 1)

await page.locator('.admin-tab', { hasText: 'Oyuncular' }).click()
await page.waitForTimeout(500)

// Geçerli PNG'yi sayfa canvas'ında üret.
const pngDataUrl = await page.evaluate(() => {
  const c = document.createElement('canvas')
  c.width = 220
  c.height = 200
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#b8f34a'
  ctx.fillRect(0, 0, 220, 200)
  ctx.fillStyle = '#0c1a04'
  ctx.beginPath()
  ctx.arc(110, 100, 66, 0, Math.PI * 2)
  ctx.fill()
  return c.toDataURL('image/png')
})

const photoBtn = page.locator('.player-row button', { hasText: 'Fotoğraf' }).first()
await photoBtn.click()
await page.waitForTimeout(400)
check('avatar modalı açılır', (await page.locator('.avatar-crop-modal').count()) === 1)

await page.locator('.avatar-file-input').setInputFiles({
  name: 'canli-avatar-test.png',
  mimeType: 'image/png',
  buffer: Buffer.from(pngDataUrl.split(',')[1], 'base64'),
})
await page.waitForTimeout(700)
check('kırpma sahnesi görünür', (await page.locator('.avatar-stage').count()) === 1)

await page.locator('.avatar-crop-modal .btn', { hasText: 'Kırp ve kaydet' }).click()
let saved = false
try {
  await page.waitForSelector('.toast', { hasText: 'güncellendi', timeout: 10000 })
  saved = true
} catch {
  saved = false
}
check('prod üzerinde avatar kaydedilir', saved)
if (saved) {
  await page.waitForTimeout(1500)
  // Public payload'da avatarUrl dolu mu + depolanan URL gerçekten servis ediliyor mu?
  const publicCheck = await page.evaluate(async () => {
    const res = await fetch('/api/league', { cache: 'no-store' })
    const payload = await res.json()
    const withPhoto = payload.players.find(p => p.avatarUrl)
    if (!withPhoto) return { ok: false, why: 'payload avatarUrl yok' }
    const img = await fetch(withPhoto.avatarUrl)
    return { ok: img.ok && (img.headers.get('content-type') || '').startsWith('image/'), why: `${withPhoto.name}: ${withPhoto.avatarUrl.slice(-40, )} → HTTP ${img.status} ${img.headers.get('content-type')}` }
  })
  check('foto URL herkese açık servis ediliyor', publicCheck.ok, publicCheck.why)

  // Temizlik: kaldır.
  await page.locator('.player-row button', { hasText: 'Kaldır' }).first().click()
  let removed = false
  try {
    await page.waitForSelector('.toast', { hasText: 'kaldırıldı', timeout: 10000 })
    removed = true
  } catch {
    removed = false
  }
  check('avatar kaldırılır (temizlik)', removed)
}

check('sayfa hatası yok', pageErrors.length === 0, pageErrors[0] ?? '')
await browser.close()

const failed = results.filter(r => !r).length
console.log(`\n${results.length - failed}/${results.length} canlı avatar testi geçti ${failed === 0 ? '✅' : '❌'}`)
process.exit(failed === 0 ? 0 : 1)
