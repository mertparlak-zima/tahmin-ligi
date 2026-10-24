// #19 FIFA/EA FC tarzı ay takvimi için saf yardımcı katman.
// DOM/store erişimi YOK: hem tarayıcı (Gea arayüzü) hem Node (testler)
// import edebilir. Tüm tarih üretimi Europe/Istanbul takvimine göredir
// (src/utils/format.ts'in Intl desenleri burada .js olarak tekrarlanır —
// format.ts'e bağımlı olunmaz, Node düz JS yükler).

import { teamCode } from '../../lib/targets.js'

const TZ = 'Europe/Istanbul'

// en-CA → 'YYYY-MM-DD' / 'YYYY-MM' biçimi (format.ts dateKey deseni).
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const monthKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })

/** Türkçe takvim düzeni: Pazartesi ilk gün. */
export const WEEKDAY_HEADERS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

// Deterministik Türkçe ay adları (Intl yok, büyük harf yok).
const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

/** year/monthIndex → 'YYYY-MM' (0-11 dışı ay girişleri yıla devrolur). */
export function monthKeyOf(year, monthIndex) {
  const total = year * 12 + Math.trunc(monthIndex)
  const y = Math.floor(total / 12)
  const m = total - y * 12
  return `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}`
}

/** 'YYYY-MM' → { year, monthIndex }; geçersiz biçimde null. */
export function parseMonthKey(key) {
  if (typeof key !== 'string') return null
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key)
  if (!match) return null
  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1 }
}

/** Ay anahtarını ±delta ay kaydırır (yıl devri dahil); geçersiz girişte null. */
export function shiftMonth(key, delta) {
  const parsed = parseMonthKey(key)
  if (!parsed) return null
  return monthKeyOf(parsed.year, parsed.monthIndex + Math.trunc(delta ?? 0))
}

/** Bugünün 'YYYY-MM' anahtarı (İstanbul takvimi). */
export function todayMonthKey(now = new Date()) {
  return monthKeyFmt.format(now)
}

/** Bugünün 'YYYY-MM-DD' anahtarı (İstanbul takvimi). */
export function todayDayKey(now = new Date()) {
  return dayKeyFmt.format(now)
}

/** Ay başlığının Türkçe uzun adı: 'Ekim 2026'. Geçersiz girişte ''. */
export function monthTitle(key) {
  const parsed = parseMonthKey(key)
  if (!parsed) return ''
  return `${MONTH_NAMES[parsed.monthIndex]} ${parsed.year}`
}

/**
 * UEFA sezon yılı: Temmuz ve sonrası aynı yıl, Ocak-Haziran bir önceki yıl
 * (lib/espn.js seasonYear ile aynı mantık, ay bazlı).
 */
export function seasonOfYearMonth(year, monthIndex) {
  return monthIndex + 1 >= 7 ? year : year - 1
}

/**
 * EA FC tarzı sabit 6×7 ızgara (Pazartesi ilk gün). Ayın 1. gününden önceki/
 * sonraki günler komşu ay dolgusudur (inMonth:false); hiçbir hücre null
 * kalmaz — Şubat gibi kısa aylarda bile tam 42 dolu hücre döner.
 * Geçersiz anahtarda boş dizi.
 */
export function monthMatrix(key) {
  const parsed = parseMonthKey(key)
  if (!parsed) return []
  // Ayın 1'i 12:00 UTC'de kurulur: İstanbul (+3) aynı takvim gününde kalır
  // (format.ts'in `T12:00:00Z` güvenli parse deseni) — böylece UTC aritmetiği
  // İstanbul takvimiyle birebir uyumlu akar.
  const first = new Date(Date.UTC(parsed.year, parsed.monthIndex, 1, 12))
  const lead = (first.getUTCDay() + 6) % 7 // Pazartesi=0 hizası
  const cursor = new Date(first)
  cursor.setUTCDate(cursor.getUTCDate() - lead)
  const rows = []
  for (let rowIdx = 0; rowIdx < 6; rowIdx++) {
    const cells = []
    for (let colIdx = 0; colIdx < 7; colIdx++) {
      cells.push({
        dayKey: dayKeyFmt.format(cursor),
        day: cursor.getUTCDate(),
        inMonth: cursor.getUTCMonth() === parsed.monthIndex,
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    rows.push(cells)
  }
  return rows
}

/**
 * Hücre etiketi için takım kısaltması. Takip edilen takımlar FB/GS/BJK/TS
 * döner (lib/targets.js kanonik eşleme: büyük/küçük harf + Türkçe karakter
 * normalizasyonlu). Değilse varsa TLA, o da yoksa adın ilk 3 harfi
 * toLocaleUpperCase('tr-TR') ile ('Sporting CP' → 'SPO').
 */
export function abbrOfTeam(name, tla = null) {
  const tracked = teamCode(name)
  if (tracked) return tracked
  const alt = String(tla ?? '').trim()
  if (alt) return alt.toLocaleUpperCase('tr-TR')
  const base = String(name ?? '').trim()
  return base.slice(0, 3).toLocaleUpperCase('tr-TR') || '?'
}

// Hücre chip sıralaması: canlı → yaklaşan → bitmiş → ertelenmiş/etkisiz.
const TONE_ORDER = { live: 0, upcoming: 1, finished: 2, inactive: 3 }
const MAX_CHIPS = 3

function toneOfMatch(match) {
  if (match.isLive || match.statusGroup === 'live') return 'live'
  if (match.statusGroup === 'inactive') return 'inactive'
  if (match.isFinished || match.statusGroup === 'finished') return 'finished'
  return 'upcoming'
}

function chipTextOf(match, tone) {
  if (tone === 'live') return match.minute != null ? `${match.minute}'` : '•'
  if (tone === 'finished') return match.score ? `${match.score.home}-${match.score.away}` : 'MS'
  if (tone === 'inactive') return 'ERT'
  const kickoff = Date.parse(match.kickoff)
  return Number.isNaN(kickoff) ? '' : timeFmt.format(new Date(kickoff))
}

function chipOf(match) {
  const tone = toneOfMatch(match)
  // Bitmiş maçta takım renklendirmesi (#20 eki): kazanan yeşil, kaybeden
  // kırmızı, beraberlikte ikisi de gri — CalChip sınıfla uygular.
  let outcome = null
  if (tone === 'finished' && match.score && match.score.home != null && match.score.away != null) {
    outcome = match.score.home > match.score.away ? 'H' : match.score.home < match.score.away ? 'A' : 'D'
  }
  return {
    id: match.id,
    title: `${match.home?.name ?? ''} – ${match.away?.name ?? ''}`,
    label: `${abbrOfTeam(match.home?.name, match.home?.tla)}–${abbrOfTeam(match.away?.name, match.away?.tla)}`,
    homeAbbr: abbrOfTeam(match.home?.name, match.home?.tla),
    awayAbbr: abbrOfTeam(match.away?.name, match.away?.tla),
    outcome,
    compCode: match.competitionCode ?? null,
    tone,
    text: chipTextOf(match, tone),
  }
}

/**
 * Bir gün hücresinin içerik özeti. matches o günün payload maçlarıdır; güvenlik
 * için kickoff'u İstanbul takviminde başka güne düşenler elenir.
 * Dönüş: { count, hasLive, chips (en fazla 3), overflow (chip'e sığmayanlar) }.
 * Sıralama: canlı önce, sonra saati yaklaştan, sonra bitmişler (gün içinde
 * kronolojik), en son ertelenmişler.
 */
export function summarizeDay(dayKey, matches) {
  const onDay = (Array.isArray(matches) ? matches : []).filter(match => {
    const kickoff = Date.parse(match.kickoff)
    return !Number.isNaN(kickoff) && dayKeyFmt.format(new Date(kickoff)) === dayKey
  })
  const sorted = [...onDay].sort((a, b) => {
    const rankDiff = TONE_ORDER[toneOfMatch(a)] - TONE_ORDER[toneOfMatch(b)]
    if (rankDiff !== 0) return rankDiff
    return (Date.parse(a.kickoff) || 0) - (Date.parse(b.kickoff) || 0)
  })
  return {
    count: onDay.length,
    hasLive: onDay.some(match => match.isLive || match.statusGroup === 'live'),
    chips: sorted.slice(0, MAX_CHIPS).map(chipOf),
    overflow: Math.max(0, onDay.length - MAX_CHIPS),
  }
}
