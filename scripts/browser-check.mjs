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

// Mobil regresım bekçisi (#15): sayfa düzeyinde yatay taşma olmamalı.
const noOverflow = async name => {
  const over = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)
  check(`${name} yatay taşma yok`, over <= 1, `${over}px`)
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

// --- 1b) Ay takvimi (#19) ---
const calRoot = await page.locator('.cal-root').count()
check('ay takvimi render', calRoot === 1)
const calCells = await page.locator('.cal-cell').count()
check('takvim 6x7 hücre', calCells === 42, `${calCells} hücre`)
const todayCells = await page.locator('.cal-cell.today').count()
check('bugün hücresi vurgulu', todayCells === 1)
const calChips = await page.locator('.cal-chip').count()
check('fikstür chipleri render', calChips > 0, `${calChips} chip`)
await noOverflow('maçlar')

// --- 1c) Önbellek hidrasyonu + ETag (#16) ---
// API bloklanınca sayfa sessionStorage önbelleğinden anında render etmeli
// (stale-while-revalidate); API açılınca manuel yenileme tazeler.
await page.route('**/api/league', route => route.abort())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
const cachedChips = await page.locator('.cal-chip').count()
check('önbellekten anında render (api bloklu)', cachedChips > 0, `${cachedChips} chip`)
check('hidrasyon sırasında bant yok', (await page.locator('.stale-band.open').count()) === 0)
await page.unroute('**/api/league')
await page.locator('.icon-btn[aria-label="Yenile"]').click()
let refreshed = false
try {
  await page.waitForSelector('.toast', { timeout: 8000 })
  refreshed = true
} catch {
  refreshed = false
}
check('api açılınca yenileme çalışır', refreshed)
const etagTest = process.env.BROWSER_CHECK_TEST_STALE
  ? { ok: true, why: 'fake-stale yanıtları etag taşımaz → atlandı' }
  : await page.evaluate(async () => {
      const r1 = await fetch('/api/league', { cache: 'no-store' })
      const etag = r1.headers.get('etag')
      if (!etag) return { ok: false, why: 'yanıtta etag başlığı yok' }
      const r2 = await fetch('/api/league', { cache: 'no-store', headers: { 'if-none-match': etag } })
      return { ok: r2.status === 304, why: `ikinci istek ${r2.status} döndü` }
    })
check('ETag/If-None-Match 304', etagTest.ok, etagTest.why)

// Maçlı bir gün seç (bugün maç olmayabilir)
const dayWithMatches = page.locator('.cal-cell').filter({ has: page.locator('.cal-chip') }).first()
if (await dayWithMatches.count() > 0) await dayWithMatches.click()
await page.waitForTimeout(500)

const matchRows = await page.locator('.match-row').count()
check('maç kartları render', matchRows > 0, `${matchRows} kart`)

if (process.env.BROWSER_CHECK_TEST_STALE) {
  // Fake-stale modunda canlıya zorlanan maçın günü seç (canlı noktalı hücre).
  const liveCell = page.locator('.cal-cell').filter({ has: page.locator('.cal-live-dot') }).first()
  if (await liveCell.count() > 0) {
    await liveCell.click()
    await page.waitForTimeout(400)
  }
  const sonLabel = await page.locator('.slot.stale', { hasText: 'SON BİLGİ' }).count()
  check('canlı satır SON BİLGİ etiketi', sonLabel >= 1, `${sonLabel} satır`)
  const sonChip = await page.locator('.cal-chip.stale').count()
  check('takvim çipinde SON etiketi', sonChip >= 1, `${sonChip} chip`)
}

// --- 2) Gün seçimi + ay gezinme (dinamik class değişimi) ---
const selectedCount = await page.locator('.cal-cell.selected').count()
check('gün seçimi aktif sınıf alır', selectedCount === 1)

const titleBefore = await page.locator('.cal-title').textContent()
await page.locator('.cal-nav[aria-label="Önceki ay"]').click()
await page.waitForTimeout(350)
const titleAfter = await page.locator('.cal-title').textContent()
check('ay geri gezinme', titleBefore !== titleAfter, `${titleBefore} → ${titleAfter}`)
check('gezinme sonrası 42 hücre', (await page.locator('.cal-cell').count()) === 42)
const todayBtnCount = await page.locator('.cal-today-btn').count()
if (todayBtnCount > 0) {
  await page.locator('.cal-today-btn').click()
  await page.waitForTimeout(350)
  check('Bugün düğmesi geri döner', (await page.locator('.cal-cell.today').count()) === 1)
} else {
  check('Bugün düğmesi geri döner', true, 'zaten bugün ayındayız')
}

// Sezon sınırı aşan ay gezinme (yalnız fake-arşivli demo sunucuda anlamlı).
if (process.env.BROWSER_CHECK_TEST_ARCHIVE) {
  let found = false
  let visited = ''
  for (let i = 0; i < 14; i++) {
    await page.locator('.cal-nav[aria-label="Önceki ay"]').click()
    await page.waitForTimeout(300)
    visited = await page.locator('.cal-title').textContent()
    if ((await page.locator('.cal-cell.in-month .cal-chip').count()) > 0) { found = true; break }
  }
  check('geçmiş sezon ayında fikstür chipleri', found, visited)
  if (found) {
    await page.locator('.cal-cell.in-month').filter({ has: page.locator('.cal-chip') }).first().click()
    await page.waitForTimeout(900)
    check('geçmiş sezon günü maç listesi', (await page.locator('.match-row').count()) > 0)
  }
  const backBtn = page.locator('.cal-today-btn')
  if (await backBtn.count() > 0) {
    await backBtn.click()
    await page.waitForTimeout(300)
  }
}

// --- 2b) Takvim hücresi hover önizlemesi (yalnız gerçek hover cihazlarında) ---
const hoverCapable = await page.evaluate(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches)
if (hoverCapable) {
  const cellWithMatches = page.locator('.cal-cell').filter({ has: page.locator('.cal-chip') }).first()
  if (await cellWithMatches.count() > 0) {
    // İşaretçi zaten hücre üzerinde olabilir (önceki tıklamalar) — mouseover
    // tetiklenmesi için önce kesin boş bir noktaya çek.
    await page.mouse.move(8, 700)
    await page.waitForTimeout(120)
    await cellWithMatches.hover()
    await page.waitForTimeout(350)
    const popoverOpen = await page.locator('.date-preview-popover.open').count()
    check('takvim hücre önizlemesi açılır', popoverOpen === 1)
    if (popoverOpen === 1) {
      const previewRows = await page.locator('.date-preview-row').count()
      check('önizlemede maç satırı var', previewRows > 0, `${previewRows} satır`)
    }
    await page.mouse.move(8, 700)
    await page.waitForTimeout(350)
    check('önizleme pointer çekilince kapanır', (await page.locator('.date-preview-popover.open').count()) === 0)
  } else {
    console.log('  bilgi: maçlı hücre yok → önizleme testi atlandı')
  }
} else {
  console.log('  bilgi: hover desteklenmiyor → önizleme testi atlandı')
}

// --- 2c) Topbar yönetim erişimi ---
const adminLinkCount = await page.locator('.topbar-actions .admin-link').count()
check('topbar yönetim düğmesi', adminLinkCount === 1)

// --- 3) Filtre segmenti (bilgi amaçlı; hata vermemeli) ---
// Ay/sezon turlarından sonra seçili gün bugün olabilir; sheet testinin maç
// bulması için maçlı bir güne geri dön.
const dayWithChipAgain = page.locator('.cal-cell').filter({ has: page.locator('.cal-chip') }).first()
if (await dayWithChipAgain.count() > 0) {
  await dayWithChipAgain.click()
  await page.waitForTimeout(400)
}
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
await noOverflow('puan durumu')
const standingsRows = await page.locator('.standings-table tbody tr').count()
if (standingsRows > 0) {
  check('puan tablosu satırları', standingsRows > 0, `${standingsRows} satır`)
  const podiumCards = await page.locator('.podium-card').count()
  check('podyum kartları', podiumCards > 0, `${podiumCards} kart`)
} else {
  console.log('  bilgi: aktif oyuncu yok → puan tablosu/podyum atlandı')
}

// --- 5b) Geçmiş Sezonlar seçicisi (#18 PR2) ---
const seasonSelectCount = await page.locator('.season-picker select').count()
check('sezon seçici render', seasonSelectCount === 1)
if (process.env.BROWSER_CHECK_TEST_ARCHIVE) {
  // DEV_FAKE_ARCHIVE=1 ile koşulan demo sunucuda geçmiş sezon akışı.
  const pastOptions = await page.locator('.season-picker option:not([value="0"])').count()
  check('geçmiş sezon seçeneği var (fake archive)', pastOptions > 0)
  if (pastOptions > 0) {
    await page.locator('.season-picker select').selectOption({ index: 1 })
    await page.waitForTimeout(1500)
    check('arşiv sezonu puan tablosu render', (await page.locator('.standings-table tbody tr').count()) > 0)
  }
} else {
  console.log('  bilgi: arşiv akışı atlandı (BROWSER_CHECK_TEST_ARCHIVE yok — gerçek DB tek sezon)')
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
  await noOverflow('admin editör')

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
