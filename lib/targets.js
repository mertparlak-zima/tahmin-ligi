// Takip edilen 4 Türk takımı, turnuva sabitleri ve isim normalizasyonu.

const TR_MAP = {
  ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u',
  Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u',
}

/** Türkçe karakterleri katlar, aksanları temizler, küçük harfe indirir. */
export function normalizeName(name) {
  const replaced = String(name ?? '').replace(/[çğıİöşüÇĞÖŞÜ]/g, ch => TR_MAP[ch] ?? ch)
  return replaced
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export const TRACKED_TEAMS = [
  { code: 'FB', name: 'Fenerbahçe', aliases: ['fenerbah'] },
  { code: 'GS', name: 'Galatasaray', aliases: ['galatasaray'] },
  { code: 'BJK', name: 'Beşiktaş', aliases: ['besiktas'] },
  { code: 'TS', name: 'Trabzonspor', aliases: ['trabzonspor'] },
]

/** İsim takım eşleşirse takım kaydını, yoksa null döner. */
export function canonicalTeam(name) {
  const normalized = normalizeName(name)
  if (!normalized) return null
  return TRACKED_TEAMS.find(t => t.aliases.some(a => normalized.includes(a))) ?? null
}

/** İki takımdan biri takip edilen takımsa maçı izleriz. */
export function isTrackedMatch(homeName, awayName) {
  return Boolean(canonicalTeam(homeName) || canonicalTeam(awayName))
}

/** Takip edilen takımın adını kanonik Türkçe yazıma çevirir. */
export function applyCanonicalSide(side) {
  const team = canonicalTeam(side.name)
  return team ? { ...side, name: team.name, short: team.name } : side
}

export function teamCode(name) {
  return canonicalTeam(name)?.code ?? null
}

export const COMPETITIONS = [
  { code: 'CL', name: 'UEFA Şampiyonlar Ligi', sortOrder: 10 },
  { code: 'EL', name: 'UEFA Avrupa Ligi', sortOrder: 20 },
  { code: 'UECL', name: 'UEFA Konferans Ligi', sortOrder: 30 },
  { code: 'TSL', name: 'Süper Lig', sortOrder: 40 },
]

export const COMPETITION_BY_CODE = Object.fromEntries(COMPETITIONS.map(c => [c.code, c]))

// Lig → turnuva kodları eşlemesi (#21): payload'lardaki competitions listesi
// bu eşlemeye göre lig kapsamına iner (TSL ligi yalnız TSL turnuvasını görür).
export const LEAGUE_COMPETITIONS = {
  EU: ['CL', 'EL', 'UECL'],
  TSL: ['TSL'],
}

/** Lig kapsamındaki turnuvalar (COMPETITIONS sırasıyla). Bilinmeyen lig → boş. */
export function competitionsForLeague(leagueCode) {
  const codes = LEAGUE_COMPETITIONS[leagueCode] ?? []
  return COMPETITIONS.filter(c => codes.includes(c.code))
}

// Lig kayıt defteri (v6): "lig" = ayrı tahmin oyunu kapsamıdır — kendi maç
// havuzu, puan tablosu ve sezonları olur; oyuncular ortaktır. İki aktif lig:
// Avrupa (EU, varsayılan) ve Süper Lig (TSL, #21 — TÜM fikstür, takım filtresi
// yok). Her ligın senkron işi kendi kodunu fetch sonuçlarına enjekte eder
// (bkv. lib/sync.js); kaynak yapılandırması lib/espn.js'de.
export const LEAGUES = [
  { code: 'EU', name: 'Avrupa', active: true },
  { code: 'TSL', name: 'Süper Lig', active: true },
]

export const DEFAULT_LEAGUE = 'EU'

export const LEAGUE_BY_CODE = Object.fromEntries(LEAGUES.map(l => [l.code, l]))

/** Aktif lig kodları (LEAGUES sırasıyla; EU ilk/varsayılan). maybeSync bu
 * listeyle tüm ligleri paralel senkronlar (#21). */
export const ACTIVE_LEAGUE_CODES = LEAGUES.filter(l => l.active).map(l => l.code)

/** Varsayılan (ilk) aktif lig kodu. activeLeague, parametre verilmezken hangi
 * lig kapsamının öntanımlı olduğunu belirler (şimdi EU; sıra LEAGUES'tan). */
export function activeLeague(now = new Date()) {
  const active = LEAGUES.filter(l => l.active)
  return active[0]?.code ?? DEFAULT_LEAGUE
}
