// Gerçek tarayıcıda (headless Chromium) UI uçtan uca kontrolü.
// Kullanım: node scripts/browser-check.mjs
// Önkoşul: npm run build && (bilek-içi demo sunucu; tohumlar için
// DEMO_TSL_SEED=1 ile başlat — "Haftanın Tahmincisi" gibi zamana bağlı
// kontroller garantili tohum verisi ister):
//   $env:DEMO_TSL_SEED='1'; node scripts/demo-server.mjs
// #24 Faz 2 ile admin girişi kaldırıldı — ADMIN_PASSWORD gerekmez;
// tahmin/oyuncu akışları herkese açık uçları kullanır.

import { chromium } from 'playwright'

const BASE = process.env.BROWSER_CHECK_URL || 'http://localhost:8787'

// #24 güvenlik bekçisi: tur TAHMİN YAZAR (Kaydet, + Oyuncu, DELETE temizliği).
// Yanlışlıkla gerçek bir ortama (dev:db = canlı Supabase, üretim) karşı
// koşulmasın — yalnız localhost'a izinlı; uzak hedef ancak bilinçli
// BROWSER_CHECK_ALLOW_REMOTE=1 ile koşar.
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(BASE)
if (!isLocal && process.env.BROWSER_CHECK_ALLOW_REMOTE !== '1') {
  console.error(`Red: BROWSER_CHECK_URL uzak hedef (${BASE}) — tur tahmin yazar. Onay için BROWSER_CHECK_ALLOW_REMOTE=1.`)
  process.exit(1)
}

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

// --- 1b) Takvim: varsayılan KOMPAKT (kullanıcı raporu: ilk ekranda maçlar
// görünmeli, ay ızgarası değil) + genişletince 6x7 ızgara ---
const calRoot = await page.locator('.cal-root').count()
check('takvim kökü render', calRoot === 1)
const compactBar = await page.locator('.cal-compact').count()
check('takvim varsayılan kompakt', compactBar === 1)
const gridVisible = await page.locator('.cal-grid').count()
check('ay ızgarası kapalı', gridVisible === 0)
check('ilk açılışta otomatik kaydırma yok', await page.evaluate(() => window.scrollY === 0), `scrollY=${await page.evaluate(() => window.scrollY)}`)
const filterVisible = await page.evaluate(() => {
  const el = document.querySelector('.filter-bar')
  if (!el) return false
  const top = el.getBoundingClientRect().top
  return top >= 0 && top < window.innerHeight
})
check('maç listesi ilk ekranda görünür (kaydırmasız)', filterVisible)
// genişletme: kompakt etikete tıkla → 6x7 ızgara + bugün vurgusu
await page.locator('.cal-compact-label').click()
await page.waitForTimeout(400)
const calCells = await page.locator('.cal-cell').count()
check('takvim 6x7 hücre', calCells === 42, `${calCells} hücre`)
const todayCells = await page.locator('.cal-cell.today').count()
check('bugün hücresi vurgulu', todayCells === 1)
const calChips = await page.locator('.cal-chip').count()
check('fikstür chipleri render', calChips > 0, `${calChips} chip`)
// kapat → kompakt geri döner
await page.locator('.cal-nav[aria-label="Takvimi kapat"]').click()
await page.waitForTimeout(300)
check('takvim kapanınca kompakt döner', (await page.locator('.cal-compact').count()) === 1)
await noOverflow('maçlar')

// --- 1b2) #21 UI: genişletilmiş takvim başlık/ok boyutları (kullanıcı geri bildirimi) ---
await page.locator('.cal-compact-label').click()
await page.waitForTimeout(300)
const calTitlePx = await page.evaluate(() =>
  parseFloat(getComputedStyle(document.querySelector('.cal-title')).fontSize)
)
check('takvim başlığı ≥20px', calTitlePx >= 20, `${calTitlePx}px`)
const calNavBox = await page.locator('.cal-nav[aria-label="Önceki ay"]').boundingBox()
check(
  'takvim ok butonu ≥40px',
  calNavBox != null && calNavBox.width >= 40 && calNavBox.height >= 40,
  calNavBox ? `${Math.round(calNavBox.width)}x${Math.round(calNavBox.height)}` : 'kutu yok'
)
// ızgarayı kapat — sonraki bölümler kompakt varsayılanla ilerlesin
await page.locator('.cal-nav[aria-label="Takvimi kapat"]').click()
await page.waitForTimeout(300)

// --- 1c) Önbellek hidrasyonu + ETag (#16) ---
// API bloklanınca sayfa sessionStorage önbelleğinden anında render etmeli
// (stale-while-revalidate); API açılınca manuel yenileme tazeler.
// #21: istekler artık ?league= taşır → glob sonek jokerli.
await page.route('**/api/league**', route => route.abort())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
// Kompakt varsayılan sonrası: ızgara kapalıyken çip yoktur — önbellekten
// ANINDA render kanıtı: kompakt bar + iskelet DEĞİL gerçek içerik (filtre
// çubuğu) anında görünür. (Gün bazlı maç kartı sayısı lig/sezon gününe
// göre 0 olabilir; eski çip sayımı ay-düzeyindeydi.)
const cachedCompact = await page.locator('.cal-compact').count()
const cachedFilter = await page.locator('.filter-bar').count()
const cachedSkeleton = await page.locator('.page-skeleton').count()
check('önbellekten anında render (api bloklu)', cachedCompact === 1 && cachedFilter === 1 && cachedSkeleton === 0, `bar=${cachedCompact} filtre=${cachedFilter} iskelet=${cachedSkeleton}`)
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

// Maçlı bir gün seç (bugün maç olmayabilir) — kompakt varsayılan sonrası
// önce ızgarayı aç, maçlı hücreyi öyle seç.
await page.locator('.cal-compact-label').click()
await page.waitForTimeout(400)
const dayWithMatches = page.locator('.cal-cell').filter({ has: page.locator('.cal-chip') }).first()
if (await dayWithMatches.count() > 0) await dayWithMatches.click()
await page.waitForTimeout(500)

const matchRows = await page.locator('.match-row').count()
check('maç kartları render', matchRows > 0, `${matchRows} kart`)

// #21 UI: maçlı gün seçilince liste yumuşak kaydırmayla görünür olur.
await page.waitForTimeout(800)
const scrollAfterDayClick = await page.evaluate(() => window.scrollY)
check('gün seçimi maç listesine kaydırır', scrollAfterDayClick > 40, `${Math.round(scrollAfterDayClick)}px`)

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
// Izgara önceki bölümden açık geliyor (kompakt varsayılan sonrası açıldı).
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

// --- 2c) Yönetim UI kaldırıldı (#24 Faz 2): topbar/footer kilit ve link yok ---
check('topbar yönetim düğmesi yok', (await page.locator('.topbar-actions .admin-link').count()) === 0)
check('footer yönetim linki yok', (await page.locator('.footer-admin').count()) === 0)

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
  // #24 sonrası: "Bu benim"/kimlik akışı kaldırıldı — düğme bulunmamalı
  check('kimlik düğmeleri kaldırıldı', (await page.locator('.identity-hero .btn', { hasText: 'Bu benim' }).count()) === 0)
  await page.locator('.players-back').click()
  await page.waitForTimeout(400)
  check('geri dönüş kart listesi', (await page.locator('.player-card').count()) === playerCards)
  check('"Benim tahminlerim" düğmesi kaldırıldı', (await page.locator('.page-meta .btn', { hasText: 'Benim tahminlerim' }).count()) === 0)
  await page.locator('.nav-item', { hasText: 'Puan' }).first().click()
  await page.waitForTimeout(500)
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
  // doğru tahminler eker; son ISO haftasında garanti görünür. (Bant yoksa
  // textContent beklemesi 30sn timeout ile turu DÜŞÜRMESİN — sayım tabanlı.)
  const weeklyChip = page.locator('.weekly-top')
  const weeklyCount = await weeklyChip.count()
  check(
    'haftanın tahmincisi bandı',
    weeklyCount === 1,
    weeklyCount === 1
      ? String((await weeklyChip.textContent()) ?? '').trim().slice(0, 56)
      : 'bant yok — demo tohumunun doğru-tahminli bitmiş maçı en yeni bitmiş ISO haftasından eski (sunucu Pazartesi açılmış olabilir)'
  )

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
  const tslLogo = await page.evaluate(() => {
    const cs = getComputedStyle(document.body, '::after')
    return { img: cs.backgroundImage, opacity: cs.opacity, size: cs.backgroundSize }
  })
  check('TSL soluk zemin logosu', tslLogo.img.includes('/logos/tsl.svg') && Number(tslLogo.opacity) > 0, JSON.stringify(tslLogo).slice(0, 80))
  // #21 UI: geniş wordmark — genişlik üst sınırlı (min(92vw,1100px)); hem
  // görünürlük (>%40 vw) hem taşmama (<2000px) aralığında ve soluk (≤0.10).
  const tslLogoW = parseFloat(String(tslLogo.size))
  check(
    'TSL zemin logo boyutu/opaklık makul',
    tslLogoW > 200 && tslLogoW < 2000 && Number(tslLogo.opacity) <= 0.1,
    `${tslLogo.size} · ${tslLogo.opacity}`
  )
  // TSL tek turnuva → kupalar seçici gizli olmalı.
  await page.locator('.nav-item', { hasText: 'Maçlar' }).first().click()
  await page.waitForTimeout(700)
  check('TSL kupalar seçici gizli', (await page.locator('.filter-bar .comp-select').count()) === 0)

  // #21 UI: Süper Lig maç kartında "N. Hafta" çipi (ESPN week=null →
  // istemci türevi; rozet yerine geçer).
  const weekChips = await page.locator('.match-row .week-chip').count()
  check('TSL maç kartında hafta çipi', weekChips > 0, `${weekChips} çip`)

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
  // #21 UI düzeltmesi: lig geçişinde değiştirici kaybolmamalı — TSL'e geçiş
  // isteği gönderilmişken (data=null iskelet fazı) switch row hâlâ DOM'da.
  await page.locator('.league-switch .seg-item', { hasText: 'Avrupa' }).click()
  await page.waitForFunction(() => document.body.classList.contains('league-eu'), undefined, { timeout: 5000 })
  check('lig geçişinde değiştirici kaybolmaz', (await page.locator('.league-switch').count()) === 1)
  await page.waitForTimeout(2500)
  check('Avrupa dönüşü body sınıfı', (await page.evaluate(() => document.body.classList.contains('league-eu'))) === true)
  check('Avrupa dönüşünde FB sütunu', (await page.locator('.standings-table th', { hasText: 'FB' }).count()) === 1)
  const euLogo = await page.evaluate(() => {
    const cs = getComputedStyle(document.body, '::before')
    return { img: cs.backgroundImage, opacity: cs.opacity, size: cs.backgroundSize }
  })
  check('Avrupa soluk zemin logosu', euLogo.img.includes('/logos/eu.svg') && Number(euLogo.opacity) > 0, JSON.stringify(euLogo).slice(0, 80))
  const euLogoW = parseFloat(String(euLogo.size))
  check(
    'EU zemin logo boyutu/opaklık makul',
    euLogoW > 200 && euLogoW < 2000 && Number(euLogo.opacity) <= 0.1,
    `${euLogo.size} · ${euLogo.opacity}`
  )
} else {
  check('lig değiştirici görünür', false, 'Süper Lig segmenti yok (meta.leagues gelmedi mi?)')
}

await page.locator('.nav-item', { hasText: 'Akış' }).first().click()
await page.waitForTimeout(500)
check('akış sayfası', (await page.locator('.flow-page, .empty').count()) > 0)
const flowEvents = await page.locator('.flow-event').count()
check('akış olayları render', flowEvents > 0, `${flowEvents} olay`)
await noOverflow('akış')

// --- 6) Herkese açık tahmin girişi (#24 Faz 2: admin paneli kaldırıldı) ---
// Akordiyon giriş formu: yaklaşan (başlamamış) maç satırı açılır → tüm
// oyuncular listelenir → bir oyuncu için 1/X/2 seçilir → Kaydet → toast +
// "girdi" rozeti. Ardından "+ Oyuncu" akışı (probe- önekli isim + temizlik).
await page.locator('.nav-item', { hasText: 'Maçlar' }).first().click()
await page.waitForTimeout(500)

// Yaklaşan filtresi + maçlı gün taraması: giriş formu yalnız BAŞLAMAMIŞ
// maçlarda çıkar. Seçili ligde hiç yaklaşan maç günü bulunamazsa Süper Lig'e
// geçilir (demo tohumu +26/+50/+74. saatlerde yaklaşan maç garanti eder).
const findUpcomingRow = async () => {
  await page.locator('.seg-item', { hasText: 'Yaklaşan' }).first().click()
  await page.waitForTimeout(450)
  if ((await page.locator('.match-row').count()) > 0) return page.locator('.match-row').first()
  // Kompakt varsayılan (#24): ızgara kapalıysa aç. Yalnız BUGÜN VE SONRASI
  // maçlı günler taranır (aria-label = gün anahtarı) — "Yaklaşan" filtresi
  // açık kaldığından dönen satırlar giriş formu açacak maçlardır.
  if ((await page.locator('.cal-compact-label').count()) > 0) {
    await page.locator('.cal-compact-label').click()
    await page.waitForTimeout(400)
  }
  const today = new Date().toISOString().slice(0, 10)
  const cells = page.locator('.cal-cell').filter({ has: page.locator('.cal-chip') })
  const keys = await cells.evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label') ?? ''))
  for (let i = 0; i < keys.length; i += 1) {
    if (!keys[i] || keys[i] < today) continue
    await cells.nth(i).click()
    await page.waitForTimeout(450)
    if ((await page.locator('.match-row').count()) > 0) return page.locator('.match-row').first()
  }
  return null
}

let upcomingRow = await findUpcomingRow()
let switchedToTsl = false
if (!upcomingRow) {
  const tslSwitch = page.locator('.league-switch .seg-item', { hasText: 'Süper Lig' })
  if ((await tslSwitch.count()) > 0) {
    await tslSwitch.click()
    await page.waitForTimeout(2500)
    switchedToTsl = true
    upcomingRow = await findUpcomingRow()
  }
}
check('yaklaşan maç bulunur', upcomingRow !== null, switchedToTsl ? 'Süper Lig tohum maçı' : '')

if (upcomingRow) {
  await upcomingRow.click()
  await page.waitForTimeout(500)
  check('giriş formu açılır', (await page.locator('.match-acc-body .entry-form').count()) === 1)
  const entryRows = await page.locator('.entry-row').count()
  check('tüm oyuncular giriş satırı', entryRows > 0, `${entryRows} satır`)
  await noOverflow('giriş formu')

  // "girdi" rozeti OLMAYAN ilk satır → kayıt sonrası rozet bu satırda belirir.
  const badgesBefore = await page.locator('.entry-badge').count()
  const badgeless = page.locator('.entry-row').filter({ hasNot: page.locator('.entry-badge') }).first()
  const target = (await badgeless.count()) > 0 ? badgeless : page.locator('.entry-row').first()
  const targetName = String((await target.locator('.entry-name').textContent()) ?? '').trim()

  await target.locator('.entry-seg-btn').first().click() // 1 (ev sahibi)
  await page.waitForTimeout(350)
  check('kirli giriş satırı vurgulanır', (await page.locator('.entry-row.dirty').count()) >= 1)

  const saveBtn = page.locator('.entry-save .btn').first()
  const saveLabel = String((await saveBtn.textContent()) ?? '')
  check('kaydet düğmesi sayı taşır', /Kaydet \(\d+\)/.test(saveLabel), saveLabel.trim())
  check('kaydet düğmesi aktif', (await saveBtn.isDisabled()) === false)

  // Kaydet → toast + sessiz tazeleme → dirty düşer + "girdi" rozeti belirir.
  await saveBtn.click()
  let savedToast = false
  try {
    await page.locator('.toast', { hasText: 'Tahminler kaydedildi' }).waitFor({ timeout: 10000 })
    savedToast = true
  } catch {
    savedToast = false
  }
  check('kaydetme toastı', savedToast)
  await page.waitForTimeout(1500)
  check('kayıt sonrası dirty düşer', (await page.locator('.entry-row.dirty').count()) === 0)
  const badgesAfter = await page.locator('.entry-badge').count()
  check(
    'girdi rozeti görünür',
    badgesBefore === 0 ? badgesAfter >= 1 : badgesAfter === badgesBefore + 1,
    `${badgesBefore}→${badgesAfter} rozet · ${targetName}`
  )

  // "+ Oyuncu" akışı: satır içi form → probe- isim → Ekle → toast → satır.
  await page.locator('.entry-add').click()
  await page.waitForTimeout(350)
  check('oyuncu formu açılır', (await page.locator('.entry-player-form.open').count()) === 1)
  const probeName = `probe-${Date.now().toString(36)}`
  await page.locator('.entry-player-form input').fill(probeName)
  await page.locator('.entry-color-chip').nth(2).click()
  await page.locator('.entry-player-form .btn', { hasText: 'Ekle' }).click()
  let playerToast = false
  try {
    await page.locator('.toast', { hasText: 'Oyuncu eklendi' }).waitFor({ timeout: 10000 })
    playerToast = true
  } catch {
    playerToast = false
  }
  check('oyuncu ekleme toastı', playerToast)
  await page.waitForTimeout(1500)
  check('yeni oyuncu satırı düşer', (await page.locator('.entry-row', { hasText: probeName }).count()) === 1)

  // Temizlik: probe oyuncunun tahmini yoktur → DELETE /api/players ile sil.
  const cleanup = await page.evaluate(async name => {
    const res = await fetch('/api/league', { cache: 'no-store' })
    const data = await res.json()
    const player = (data.players ?? []).find(p => p.name === name)
    if (!player) return { ok: false, why: 'oyuncu payloadda bulunamadı' }
    const del = await fetch('/api/players', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: player.id }),
    })
    return { ok: del.ok, why: `HTTP ${del.status}` }
  }, probeName)
  check('probe oyuncu temizlenir', cleanup.ok, cleanup.why)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('Escape akordiyonu kapatır (giriş)', (await page.locator('.match-acc-body').count()) === 0)
}

// Süper Lig'e geçildiyse Avrupa'ya dön (tur sonu EU bağlamında bitsin).
if (switchedToTsl) {
  await page.locator('.league-switch .seg-item', { hasText: 'Avrupa' }).click()
  await page.waitForTimeout(2000)
}

// --- 7) Sayfa hataları (tur sonunda tekrar) ---
check('tur sonunda sayfa hatası yok', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))

await browser.close()

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} tarayıcı testi geçti ${failed.length === 0 ? '✅' : '❌'}`)
process.exit(failed.length === 0 ? 0 : 1)
