// Gerçek tarayıcıda (headless Chromium) UI uçtan uca kontrolü.
// Kullanım: node --env-file=.env scripts/browser-check.mjs
// Önkoşul: npm run build && npm run dev:db (http://localhost:8787 ayakta)

import { chromium } from 'playwright'

const BASE = process.env.BROWSER_CHECK_URL || 'http://localhost:8787'
const PASSWORD = process.env.ADMIN_PASSWORD

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }) // mobil görünüm

const pageErrors = []
page.on('pageerror', err => pageErrors.push(String(err)))
const consoleErrors = []
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})

// --- 1) Ana sayfa yüklenmesi ---
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000) // ilk load + lazy sync

check('sayfa hatasız açıldı', pageErrors.length === 0, pageErrors[0] ?? '')
check('konsol hatası yok', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))

const topbar = await page.locator('.topbar').count()
check('topbar render', topbar === 1)

// Bayatlık bandı: normal akışta yanlış alarm YOK olmalı (#18).
// DEV_FAKE_STALE=1 ile koşulan demo sunucuda BROWSER_CHECK_TEST_STALE=1
// verilirse bandın ve SON BİLGİ etiketinin GÖRÜNDÜĞÜ doğulanır.
if (process.env.BROWSER_CHECK_TEST_STALE) {
  const bandOpen = await page.locator('.stale-band.open').count()
  check('bayatlık bandı görünür (fake stale)', bandOpen === 1)
} else {
  const bandOpen = await page.locator('.stale-band.open').count()
  check('bayatlık bandı yanlış alarm yok', bandOpen === 0)
}

const dateChips = await page.locator('.date-chip').count()
check('tarih şeridi dolu', dateChips > 0, `${dateChips} chip`)

// Maçlı bir gün seç (bugün maç olmayabilir)
const chipWithMatches = page.locator('.date-chip').filter({ has: page.locator('.date-count, .date-live-dot') }).first()
if (await chipWithMatches.count() > 0) await chipWithMatches.click()
await page.waitForTimeout(500)

const matchRows = await page.locator('.match-row').count()
check('maç kartları render', matchRows > 0, `${matchRows} kart`)

if (process.env.BROWSER_CHECK_TEST_STALE) {
  // Fake-stale modunda canlıya zorlanan maçın gününü seç (canlı noktalı chip).
  const liveChip = page.locator('.date-chip').filter({ has: page.locator('.date-live-dot') }).first()
  if (await liveChip.count() > 0) {
    await liveChip.click()
    await page.waitForTimeout(400)
  }
  const sonLabel = await page.locator('.slot.stale', { hasText: 'SON BİLGİ' }).count()
  check('canlı satır SON BİLGİ etiketi', sonLabel >= 1, `${sonLabel} satır`)
}

// --- 2) Tarih chip'ine tıklama (dinamik class değişimi) ---
const firstChip = page.locator('.date-chip').first()
await firstChip.click()
await page.waitForTimeout(300)
const selectedCount = await page.locator('.date-chip.selected').count()
check('tarih seçimi aktif sınıf alır', selectedCount === 1)

// --- 2b) Tarih chip hover önizlemesi (yalnız gerçek hover cihazlarında) ---
const hoverCapable = await page.evaluate(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches)
if (hoverCapable) {
  const chipWithMatches2 = page.locator('.date-chip').filter({ has: page.locator('.date-count, .date-live-dot') }).first()
  if (await chipWithMatches2.count() > 0) {
    // İşaretçi zaten chip üzerinde olabilir (önceki tıklamalar) — mouseover
    // tetiklenmesi için önce kesin boş bir noktaya çek.
    await page.mouse.move(8, 600)
    await page.waitForTimeout(120)
    await chipWithMatches2.hover()
    await page.waitForTimeout(350)
    const popoverOpen = await page.locator('.date-preview-popover.open').count()
    check('tarih chip önizlemesi açılır', popoverOpen === 1)
    if (popoverOpen === 1) {
      const previewRows = await page.locator('.date-preview-row').count()
      check('önizlemede maç satırı var', previewRows > 0, `${previewRows} satır`)
    }
    await page.mouse.move(8, 600)
    await page.waitForTimeout(350)
    check('önizleme pointer çekilince kapanır', (await page.locator('.date-preview-popover.open').count()) === 0)
  } else {
    console.log('  bilgi: maçlı chip yok → önizleme testi atlandı')
  }
} else {
  console.log('  bilgi: hover desteklenmiyor → önizleme testi atlandı')
}

// --- 2c) Topbar yönetim erişimi ---
const adminLinkCount = await page.locator('.topbar-actions .admin-link').count()
check('topbar yönetim düğmesi', adminLinkCount === 1)

// --- 3) Filtre segmenti (bilgi amaçlı; hata vermemeli) ---
await page.locator('.seg-item', { hasText: 'Bitti' }).first().click()
await page.waitForTimeout(300)
const finishedRows = await page.locator('.match-row').count()
console.log(`  bilgi: bitti filtresi → ${finishedRows} kart`)
await page.locator('.seg-item', { hasText: 'Tümü' }).first().click()
await page.waitForTimeout(300)

// --- 4) Maç detay sheet'i ---
const anyRow = page.locator('.match-row').first()
if (await anyRow.count() > 0) {
  await anyRow.click()
  await page.waitForTimeout(400)
  const sheet = await page.locator('.sheet').count()
  check('maç sheeti açılır', sheet === 1)
  const sheetOk = await page.locator('.sheet-scoreboard').count()
  check('sheet skorboardu görünür', sheetOk === 1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('Escape sheeti kapatır', (await page.locator('.sheet').count()) === 0)
} else {
  check('maç sheeti açılır', false, 'maç satırı yok')
}

// --- 5) Sayfa gezinmesi ---
await page.locator('.nav-item', { hasText: 'Puan' }).first().click()
await page.waitForTimeout(500)
check('puan sayfası', (await page.locator('.standings-page, .empty').count()) > 0)
const standingsRows = await page.locator('.standings-table tbody tr').count()
if (standingsRows > 0) {
  check('puan tablosu satırları', standingsRows > 0, `${standingsRows} satır`)
  const podiumCards = await page.locator('.podium-card').count()
  check('podyum kartları', podiumCards > 0, `${podiumCards} kart`)
} else {
  console.log('  bilgi: aktif oyuncu yok → puan tablosu/podyum atlandı')
}

await page.locator('.nav-item', { hasText: 'Tahminlerim' }).first().click()
await page.waitForTimeout(500)
const identityModal = await page.locator('.identity-grid, .mypage, .empty').count()
check('tahminlerim sayfası / kimlik', identityModal > 0)
// Kimlik seçimi (oyuncu varsa)
const chip = page.locator('.identity-chip').first()
if (await chip.count() > 0) {
  await chip.click()
  await page.waitForTimeout(400)
  check('kimlik seçilince karne görünür', (await page.locator('.identity-hero').count()) === 1)
  const statCards = await page.locator('.stat-card').count()
  check('karne istatistik kartları', statCards === 4, `${statCards} kart`)
  // puan tablosunda SEN satırı
  await page.locator('.nav-item', { hasText: 'Puan' }).first().click()
  await page.waitForTimeout(500)
  const youTag = await page.locator('.you-tag').count()
  check('puan tablosunda SEN satırı', youTag === 1)
}

await page.locator('.nav-item', { hasText: 'Geçmiş' }).first().click()
await page.waitForTimeout(500)
check('geçmiş sayfası', (await page.locator('.results-page, .empty').count()) > 0)
const dayGroups = await page.locator('.day-group').count()
if (dayGroups > 0) {
  const resultItems = await page.locator('.result-item').count()
  check('geçmiş gün grupları ve sonuçlar', resultItems > 0, `${dayGroups} grup · ${resultItems} sonuç`)
}

await page.locator('.nav-item', { hasText: 'Maçlar' }).first().click()
await page.waitForTimeout(300)

// --- 6) Admin paneli ---
await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(800)

const loginInput = page.locator('.admin-login-card input[type="password"]')
if (await loginInput.count() > 0) {
  // yanlış şifre
  await loginInput.fill('yanlis-sifre')
  await page.locator('.admin-login-card .btn').click()
  await page.waitForTimeout(800)
  check('yanlış şifre hata gösterir', (await page.locator('.error-box').count()) > 0)

  // doğru şifre
  await loginInput.fill(PASSWORD)
  await page.locator('.admin-login-card .btn').click()
  await page.waitForTimeout(2500)
  check('admin girişi başarılı', (await page.locator('.admin-tabs').count()) === 1)

  // tahmin editörü
  const editorRows = await page.locator('.editor-row').count()
  check('tahmin editörü satırları', editorRows > 0, `${editorRows} satır`)

  // bir select değiştir → dirty bar (önceki koşuda kaydedilen değerden farklı seç)
  const openSelect = page.locator('.editor-select:not([disabled])').first()
  if (await openSelect.count() > 0) {
    const currentVal = await openSelect.inputValue()
    const nextVal = currentVal === 'H' ? 'D' : 'H'
    await openSelect.selectOption(nextVal)
    try {
      await page.waitForSelector('.save-bar', { timeout: 5000 })
      check('dirty bar görünür', true)
    } catch {
      check('dirty bar görünür', false, 'save-bar görünmedi')
    }
    // Kaydetme testi yalnız açık izinle (BROWSER_CHECK_ALLOW_SAVE=1) çalışır;
    // aksi halde gerçek tahmin verisi değiştirilmez (lokal dev:db de gerçek
    // Supabase'i kullanır!).
    if (process.env.BROWSER_CHECK_ALLOW_SAVE) {
      await page.locator('.save-bar .btn').click()
      try {
        await page.waitForSelector('.toast', { timeout: 10000 })
        check('kaydetme toastı', true)
      } catch {
        check('kaydetme toastı', false, '10s içinde toast görünmedi')
      }
    } else {
      console.log('  bilgi: kaydetme testi atlandı (BROWSER_CHECK_ALLOW_SAVE yok — gerçek veri korunur)')
      await page.reload()
      await page.waitForTimeout(2500)
    }
  } else {
    check('dirty bar görünür', false, 'açık maç select yok')
  }

  // oyuncular sekmesi
  await page.locator('.admin-tab', { hasText: 'Oyuncular' }).click()
  await page.waitForTimeout(500)
  check('oyuncular sekmesi', (await page.locator('.player-form').count()) === 1)

  // puanlama sekmesi
  await page.locator('.admin-tab', { hasText: 'Puanlama' }).click()
  await page.waitForTimeout(500)
  check('puanlama sekmesi', (await page.locator('.admin-scoring').count()) === 1)

  // veri sekmesi + manuel senkron toastı
  await page.locator('.admin-tab', { hasText: 'Veri' }).click()
  await page.waitForTimeout(500)
  check('veri sekmesi', (await page.locator('.data-grid').count()) === 1)
  const syncBtn = page.locator('.admin-data .btn', { hasText: 'Şimdi senkronize et' })
  if (await syncBtn.count() > 0) {
    await syncBtn.click()
    try {
      await page.waitForSelector('.toast', { timeout: 25000 }) // ESPN çekimi değişken sürebilir
      check('manuel senkron toastı', true)
    } catch {
      check('manuel senkron toastı', false, '25s içinde toast görünmedi')
    }
  } else {
    check('manuel senkron toastı', false, 'senkron düğmesi yok')
  }
} else {
  check('admin girişi başarılı', false, 'login ekranı görünmedi')
}

// --- 7) Sayfa hataları (tur sonunda tekrar) ---
check('tur sonunda sayfa hatası yok', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))

await browser.close()

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} tarayıcı testi geçti ${failed.length === 0 ? '✅' : '❌'}`)
process.exit(failed.length === 0 ? 0 : 1)
