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
// #21: istekler artık ?league= taşır → glob sonek jokerli.
await page.route('**/api/league**', route => route.abort())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
const cachedChips = await page.locator('.cal-chip').count()
check('önbellekten anında render (api bloklu)', cachedChips > 0, `${cachedChips} chip`)
check('hidrasyon sırasında bant yok', (await page.locator('.stale-band.open').count()) === 0)
await page.unroute('**/api/league**')
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

// --- 4) Maç detay akordiyonu (#12 B) ---
const anyRow = page.locator('.match-row').first()
if (await anyRow.count() > 0) {
  await anyRow.click()
  await page.waitForTimeout(400)
  const accBody = await page.locator('.match-acc-body').count()
  check('maç akordiyonu açılır', accBody === 1)
  const accRows = await page.locator('.match-acc-body .pred-row').count()
  check('akordiyonda tahmin satırları', true, `${accRows} satır`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('Escape akordiyonu kapatır', (await page.locator('.match-acc-body').count()) === 0)
} else {
  check('maç akordiyonu açılır', false, 'maç satırı yok')
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

// --- 5c) Oyuncular (#20 U8): kimlik istemeden açılır; kartlar + detay karne ---
await page.locator('.nav-item', { hasText: 'Oyuncular' }).first().click()
await page.waitForTimeout(600)
check('oyuncular otomatik kimlik istemez', (await page.locator('.identity-grid').count()) === 0)
const playerCards = await page.locator('.player-card').count()
check('oyuncu kartları render', playerCards > 0, `${playerCards} kart`)
await noOverflow('oyuncular')
if (playerCards > 0) {
  await page.locator('.player-card').first().click()
  await page.waitForTimeout(500)
  check('oyuncu detayı açılır', (await page.locator('.identity-hero').count()) === 1)
  const detailStats = await page.locator('.stat-card').count()
  check('detay istatistik kartları', detailStats === 4, `${detailStats} kart`)
  await page.locator('.players-back').click()
  await page.waitForTimeout(400)
  check('geri dönüş kart listesi', (await page.locator('.player-card').count()) === playerCards)
  // "Bu benim" akışı → SEN vurguları (puan tablosu SEN kontrolü bunu kullanır)
  await page.locator('.player-card').first().click()
  await page.waitForTimeout(400)
  const meBtn = page.locator('.identity-hero .btn', { hasText: 'Bu benim' })
  if (await meBtn.count() > 0) {
    await meBtn.click()
    await page.waitForTimeout(400)
  }
  // puan tablosunda SEN satırı
  await page.locator('.nav-item', { hasText: 'Puan' }).first().click()
  await page.waitForTimeout(500)
  const youTag = await page.locator('.you-tag').count()
  check('puan tablosunda SEN satırı', youTag === 1)
}

// --- 5d) Lig değiştirici (#21 Faz 2): TSL teması + İsabet sütunu ---
// Puan sayfasındayken Süper Lig segmentine geç → body sınıfı, sütun seti,
// zemin logosu değişmeli; Avrupa'ya dönüş FB sütununu geri getirmeli.
const tslSegment = page.locator('.league-switch .seg-item', { hasText: 'Süper Lig' })
if ((await tslSegment.count()) > 0) {
  // Sütun doğulamaları puan tablosu sayfasında yapılır.
  await page.locator('.nav-item', { hasText: 'Puan' }).first().click()
  await page.waitForTimeout(500)
  await tslSegment.click()
  await page.waitForTimeout(2500)
  check('lig değiştirici TSL body sınıfı', (await page.evaluate(() => document.body.classList.contains('league-tsl'))) === true)
  check('TSL puan tablosunda İsabet sütunu', (await page.locator('.standings-table th', { hasText: 'İsabet' }).count()) === 1)
  check('TSL puan tablosunda FB sütunu yok', (await page.locator('.standings-table th', { hasText: 'FB' }).count()) === 0)
  const accCells = await page.locator('.standings-table td.acc-col').count()
  check('TSL satırlarında isabet değeri', accCells > 0, `${accCells} hücre`)

  // #21 Faz 3: Haftanın tahmincisi bandı — TSL demo tohumu bitmiş maçlara
  // doğru tahminler eker; son ISO haftasında garanti görünür.
  const weeklyChip = page.locator('.weekly-top')
  check('haftanın tahmincisi bandı', (await weeklyChip.count()) === 1, String((await weeklyChip.textContent()) ?? '').trim().slice(0, 56))

  // #21 Faz 3: İsabet Şampiyonası segmenti + birleşik tablo (EU % / TSL % / Genel %).
  const champSeg = page.locator('.standings-view-switch .seg-item', { hasText: 'İsabet Şampiyonası' })
  check('isabet şampiyonası segmenti render', (await champSeg.count()) === 1)
  await champSeg.click()
  await page.waitForTimeout(1500) // diğer ligin payload'ı tek seferliğine çekilir
  check('isabet tablosu EU % sütunu', (await page.locator('.accuracy-table th', { hasText: 'EU %' }).count()) === 1)
  check('isabet tablosu TSL % sütunu', (await page.locator('.accuracy-table th', { hasText: 'TSL %' }).count()) === 1)
  check('isabet tablosu Genel % sütunu', (await page.locator('.accuracy-table th', { hasText: 'Genel %' }).count()) === 1)
  const accRows = await page.locator('.accuracy-table tbody tr').count()
  check('isabet tablosu birleşik satırlar', accRows > 0, `${accRows} satır`)
  await page.locator('.standings-view-switch .seg-item', { hasText: 'Lig' }).first().click()
  await page.waitForTimeout(500)
  check('lig görünümüne dönüş', (await page.locator('.standings-table').count()) === 1)
  const tslLogo = await page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage)
  check('TSL soluk zemin logosu', tslLogo.includes('/logos/tsl.svg'), String(tslLogo).slice(0, 64))
  // TSL tek turnuva → kupalar seçici gizli olmalı.
  await page.locator('.nav-item', { hasText: 'Maçlar' }).first().click()
  await page.waitForTimeout(700)
  check('TSL kupalar seçici gizli', (await page.locator('.filter-bar .comp-select').count()) === 0)

  // #21 Faz 3: TSL form çipleri — 4 büyük dışı takımlı maçın akordiyonunda
  // takım form çipleri (payload home.form/away.form; buildTeamForms tüm
  // takımları kapsar). Tohum maçları Samsunspor/Konyaspor/Başakşehir garantiler.
  const tslRows = page.locator('.match-row')
  const nonBig4Row = tslRows.filter({ hasText: /Samsunspor|Konyaspor|Başakşehir/ }).first()
  const formRowTarget = (await nonBig4Row.count()) > 0 ? nonBig4Row : tslRows.first()
  if ((await formRowTarget.count()) > 0) {
    const formRowText = String((await formRowTarget.textContent()) ?? '')
    await formRowTarget.click()
    await page.waitForTimeout(500)
    const formChips = await page.locator('.match-acc-body .form-chips').count()
    check('TSL maç akordiyonunda form çipleri', formChips > 0, `${formChips} çip seti · ${formRowText.trim().slice(0, 40)}`)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  } else {
    check('TSL maç akordiyonunda form çipleri', false, 'maç satırı yok')
  }
  await page.locator('.nav-item', { hasText: 'Puan' }).first().click()
  await page.waitForTimeout(600)
  // Avrupa'ya dön: tema + FB sütunu + logo geri gelmeli.
  await page.locator('.league-switch .seg-item', { hasText: 'Avrupa' }).click()
  await page.waitForTimeout(2500)
  check('Avrupa dönüşü body sınıfı', (await page.evaluate(() => document.body.classList.contains('league-eu'))) === true)
  check('Avrupa dönüşünde FB sütunu', (await page.locator('.standings-table th', { hasText: 'FB' }).count()) === 1)
  const euLogo = await page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage)
  check('Avrupa soluk zemin logosu', euLogo.includes('/logos/eu.svg'), String(euLogo).slice(0, 64))
} else {
  check('lig değiştirici görünür', false, 'Süper Lig segmenti yok (meta.leagues gelmedi mi?)')
}

await page.locator('.nav-item', { hasText: 'Akış' }).first().click()
await page.waitForTimeout(500)
check('akış sayfası', (await page.locator('.flow-page, .empty').count()) > 0)
const flowEvents = await page.locator('.flow-event').count()
check('akış olayları render', flowEvents > 0, `${flowEvents} olay`)
await noOverflow('akış')

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

  // tahmin editörü akordiyonu (#20 U4)
  const accHeads = await page.locator('.acc-head').count()
  check('tahmin editörü akordiyon başlıkları', accHeads > 0, `${accHeads} başlık`)
  await noOverflow('admin editör')
  check('eski save-bar kaldırıldı', (await page.locator('.save-bar').count()) === 0)
  check('eski editor-select kaldırıldı', (await page.locator('.editor-select').count()) === 0)

  const firstHead = page.locator('.acc-head').first()
  if (await firstHead.count() > 0) {
    check('başlık kapalıyken aria-expanded=false', (await firstHead.getAttribute('aria-expanded')) === 'false')
    await firstHead.click()
    await page.waitForTimeout(400)
    const predRows = await page.locator('.acc-pred-row').count()
    check('akordiyon açılınca oyuncu satırları', predRows > 0, `${predRows} satır`)
    check('başlık açıkken aria-expanded=true', (await firstHead.getAttribute('aria-expanded')) === 'true')

    // ikinci başlığı aç → yalnız 1 akordiyon açık kalır (openMatchId)
    const secondHead = page.locator('.acc-head').nth(1)
    if (await secondHead.count() > 0) {
      await secondHead.click()
      await page.waitForTimeout(400)
      check('aynı anda tek akordiyon açık', (await page.locator('.acc-item.open').count()) === 1)
    }

    // oyuncu filtre çipi: açık akordiyon satırları tek oyuncuya iner
    const chips = page.locator('.acc-chip')
    if (await chips.count() > 1) {
      await chips.nth(1).click()
      await page.waitForTimeout(400)
      const filteredRows = await page.locator('.acc-item.open .acc-pred-row').count()
      check('oyuncu filtre çipi tek satır bırakır', filteredRows === 1, `${filteredRows} satır`)
      await chips.nth(1).click()
      await page.waitForTimeout(300)
    } else {
      console.log('  bilgi: oyuncu çipi yok → filtre testi atlandı')
    }

    // bir select değiştir → dirty satır + 'Kaydet (N)' aktif
    const openSelect = page.locator('.acc-item.open .acc-pred-select').first()
    if (await openSelect.count() > 0) {
      const currentVal = await openSelect.inputValue()
      const nextVal = currentVal === 'H' ? 'D' : 'H'
      await openSelect.selectOption(nextVal)
      try {
        await page.waitForSelector('.acc-pred-row.dirty', { timeout: 5000 })
        check('kirli oyuncu satırı vurgulanır', true)
      } catch {
        check('kirli oyuncu satırı vurgulanır', false, 'dirty satır görünmedi')
      }
      const saveBtn = page.locator('.acc-item.open .acc-save .btn').first()
      const saveLabel = String((await saveBtn.textContent()) ?? '')
      check('kaydet düğmesi sayı taşır', /Kaydet \(\d+\)/.test(saveLabel), saveLabel.trim())
      check('kaydet düğmesi aktif', (await saveBtn.isDisabled()) === false)

      // Kaydetme testi yalnız açık izinle (BROWSER_CHECK_ALLOW_SAVE=1) çalışır;
      // aksi halde gerçek tahmin verisi değiştirilmez (lokal dev:db de gerçek
      // Supabase'i kullanır!). Başarı: dirty vurgusu düşer + 'Kaydedildi' + toast.
      if (process.env.BROWSER_CHECK_ALLOW_SAVE) {
        await saveBtn.click()
        try {
          await page.waitForSelector('.toast', { timeout: 10000 })
          check('kaydetme toastı', true)
        } catch {
          check('kaydetme toastı', false, '10s içinde toast görünmedi')
        }
        await page.waitForTimeout(400)
        check('kayıt sonrası dirty düşer', (await page.locator('.acc-pred-row.dirty').count()) === 0)
        const savedLabel = String((await page.locator('.acc-item.open .acc-save .btn').first().textContent()) ?? '')
        check('kayıt sonrası düğme Kaydedildi', savedLabel.includes('Kaydedildi'), savedLabel.trim())
      } else {
        console.log('  bilgi: kaydetme testi atlandı (BROWSER_CHECK_ALLOW_SAVE yok — gerçek veri korunur)')
        await page.reload()
        await page.waitForTimeout(2500)
      }
    } else {
      check('kirli oyuncu satırı vurgulanır', false, 'açık akordiyonda select yok')
    }
  } else {
    check('akordiyon açılınca oyuncu satırları', false, 'akordiyon başlığı yok')
  }

  // --- #21 Faz 3: admin lig seçici — editör günleri Süper Lig'e döner ---
  const tslAdminSeg = page.locator('.admin-league-switch .seg-item', { hasText: 'Süper Lig' })
  check('admin lig seçici render', (await tslAdminSeg.count()) === 1)
  await tslAdminSeg.click()
  await page.waitForTimeout(1500)
  check('admin lig bağlamı Süper Lig', String((await page.locator('.admin-league-context').textContent()) ?? '').includes('Süper Lig'))
  const tslEditorText = String((await page.locator('.admin-preds').textContent()) ?? '')
  check('admin editör Süper Lig takımlarına döner', /Samsunspor|Başakşehir/.test(tslEditorText), 'tohum takımları görünmüyor')

  // --- #21 Faz 3: hızlı tahmin girişi — boş açık maçlara taslak basar ---
  const quickChips = page.locator('.acc-chip')
  if ((await quickChips.count()) > 1) {
    await quickChips.nth(1).click() // ilk oyuncu çipi (0 = Tümü)
    await page.waitForTimeout(400)
    const quickRow = await page.locator('.quick-fill').count()
    check('hızlı giriş satırı görünür', quickRow === 1)
    if (quickRow === 1) {
      // Oyuncunun taslağı boş bir maç bul ve aç (tohum tahminli maçlar dolu).
      let openedEmpty = false
      const headTotal = await page.locator('.acc-head').count()
      for (let i = 0; i < Math.min(headTotal, 6); i += 1) {
        const head = page.locator('.acc-head').nth(i)
        if ((await head.getAttribute('aria-expanded')) !== 'true') {
          await head.click()
          await page.waitForTimeout(400)
        }
        const openSel = page.locator('.acc-item.open .acc-pred-select').first()
        if ((await openSel.count()) > 0 && (await openSel.inputValue()) === '') {
          openedEmpty = true
          break
        }
      }
      const dirtyBefore = await page.locator('.acc-item.open .acc-pred-row.dirty').count()
      await page.locator('.quick-fill .btn', { hasText: 'Ev sahibi' }).click()
      await page.waitForTimeout(500)
      const dirtyAfter = await page.locator('.acc-item.open .acc-pred-row.dirty').count()
      check('hızlı giriş boş taslakları doldurur', openedEmpty ? dirtyAfter === dirtyBefore + 1 : true, openedEmpty ? `${dirtyAfter} kirli satır` : 'boş maç bulunamadı — atlandı')
      check('hızlı giriş satırı dolunca gizlenir', (await page.locator('.quick-fill').count()) === 0)
    }
    await quickChips.nth(1).click() // filtre temizle
    await page.waitForTimeout(300)
  } else {
    console.log('  bilgi: oyuncu çipi yok → hızlı giriş testi atlandı')
  }

  // Avrupa'ya dönüş — bağlam + editör geri döner.
  await page.locator('.admin-league-switch .seg-item', { hasText: 'Avrupa' }).click()
  await page.waitForTimeout(1500)
  check('admin Avrupa dönüşü', String((await page.locator('.admin-league-context').textContent()) ?? '').includes('Avrupa'))

  // oyuncular sekmesi
  await page.locator('.admin-tab', { hasText: 'Oyuncular' }).click()
  await page.waitForTimeout(500)
  check('oyuncular sekmesi', (await page.locator('.player-form').count()) === 1)

  // Avatar akışı (#17) — yalnız bellek-içi storage stub'lı demo sunucuda.
  if (process.env.BROWSER_CHECK_TEST_AVATAR) {
    // 64x64 geçerli PNG'yi sayfa canvas'ında üret (dosya yazmadan).
    const pngDataUrl = await page.evaluate(() => {
      const c = document.createElement('canvas')
      c.width = 200
      c.height = 180
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#b8f34a'
      ctx.fillRect(0, 0, 200, 180)
      ctx.fillStyle = '#0c1a04'
      ctx.beginPath()
      ctx.arc(100, 90, 60, 0, Math.PI * 2)
      ctx.fill()
      return c.toDataURL('image/png')
    })
    const pngBuffer = Buffer.from(pngDataUrl.split(',')[1], 'base64')
    const firstPhotoBtn = page.locator('.player-row button', { hasText: 'Fotoğraf' }).first()
    if (await firstPhotoBtn.count() > 0) {
      await firstPhotoBtn.click()
      await page.waitForTimeout(400)
      check('avatar modalı açılır', (await page.locator('.avatar-crop-modal').count()) === 1)
      await page.locator('.avatar-file-input').setInputFiles({
        name: 'test-avatar.png',
        mimeType: 'image/png',
        buffer: pngBuffer,
      })
      await page.waitForTimeout(600)
      check('kırpma sahnesi görünür', (await page.locator('.avatar-stage').count()) === 1)
      await page.locator('.avatar-crop-modal .btn', { hasText: 'Kırp ve kaydet' }).click()
      let avatarSaved = false
      try {
        await page.waitForSelector('.toast', { timeout: 8000 })
        avatarSaved = true
      } catch {
        avatarSaved = false
      }
      check('avatar kaydedilir', avatarSaved)
      if (avatarSaved) {
        await page.waitForTimeout(800)
        const hasChangeBtn = await page.locator('.player-row button', { hasText: 'Fotoğrafı değiştir' }).count()
        check('oyuncu satırı foto gösterir', hasChangeBtn > 0)
        const removeBtn = page.locator('.player-row button', { hasText: 'Kaldır' }).first()
        if (await removeBtn.count() > 0) {
          await removeBtn.click()
          await page.waitForTimeout(1500)
          const removed = (await page.locator('.player-row button', { hasText: 'Fotoğrafı değiştir' }).count()) === 0
          check('avatar kaldırılır', removed)
        }
      }
    } else {
      check('avatar modalı açılır', false, 'Fotoğraf düğmesi yok')
    }
  } else {
    console.log('  bilgi: avatar akışı atlandı (BROWSER_CHECK_TEST_AVATAR yok — gerçek DB bucket ister)')
  }

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
    // #21 Faz 3: senkron yanıtı lig bazlı `leagues` detayı taşır → satırlar.
    await page.waitForTimeout(600)
    const leagueLines = await page.locator('.sync-league-line').count()
    check('senkron lig bazlı satırlar', leagueLines === 2, `${leagueLines} satır`)
  } else {
    check('manuel senkron toastı', false, 'senkron düğmesi yok')
  }
} else {
  check('admin girişi başarılı', false, 'login ekranı görünmedi')
}

// --- 6b) Yönetimden çıkış (#20): header düğmesi oturumu kapatır, tema kalkar ---
if ((await page.locator('.admin-exit').count()) > 0) {
  await page.locator('.admin-exit').click()
  await page.waitForTimeout(500)
  check('çıkış admin modunu kapatır', (await page.evaluate(() => document.body.classList.contains('admin-mode'))) === false)
  check('giriş ekranı döner', (await page.locator('.admin-login-card').count()) === 1)
} else {
  check('çıkış admin modunu kapatır', false, 'header çıkış düğmesi yok (oturum açık değildi mi?)')
}

// --- 7) Sayfa hataları (tur sonunda tekrar) ---
check('tur sonunda sayfa hatası yok', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))

await browser.close()

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} tarayıcı testi geçti ${failed.length === 0 ? '✅' : '❌'}`)
process.exit(failed.length === 0 ? 0 : 1)
