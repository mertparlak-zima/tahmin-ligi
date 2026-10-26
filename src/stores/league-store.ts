// Lig verisi: yükleme, adaptif polling, görünüm filtreleri, ay takvimi (#19).

import { Store } from '@geajs/core'
import { dateKey, todayKey, shiftDay } from '../utils/format'
import {
  monthMatrix,
  parseMonthKey,
  seasonOfYearMonth,
  shiftMonth,
  summarizeDay,
  todayMonthKey,
} from '../utils/calendar.js'
import { buildFlowEvents } from '../utils/flow.js'

export type StatusFilter = 'all' | 'live' | 'upcoming' | 'finished'

/** sessionStorage SWR önbelleği (#16): dönüş ziyarette ilk ekran anında.
 *  v2 (#21): kayda lig kodu eklendi — hidrasyon yalnız aktif lig için;
 *  tek anahtar üzerine yazıldığından yalnız SON lig önbellekte kalır
 *  (büyük TSL payload'ı kota riski oluşturmaz). */
const CACHE_KEY = 'tahminligi.league.cache.v2'
const CACHE_MAX_AGE_MS = 12 * 3600_000
/** #21 Faz 2: seçili lig tercihi localStorage'da kalıcı. */
const LEAGUE_PREF_KEY = 'tahminligi.league'

/** #21 Faz 3: kickoff'ın ISO haftasının pazartesi (hafta başı) gün anahtarı —
 *  İstanbul saat diliminde dateKey üzerinden (12:00 ile güvenli parse). */
function isoMondayKey(iso: string): string {
  const day = dateKey(iso)
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay() // 0 = pazar
  return shiftDay(day, -((weekday + 6) % 7))
}

class LeagueStore extends Store {
  /** #21 Faz 2: seçili lig ('EU' | 'TSL'); localStorage'dan okunur, switchLeague'de yazılır. */
  league: string = 'EU'
  data: any = null
  loading = false
  error: string | null = null
  lastLoadedAt = 0
  /** Art arda başarısız polling sayısı — bağlantı göstergesi için (#18). */
  consecutiveFailures = 0
  /** Sunucudan gelen ETag — değişmediğinde 304 ile transfer kesilir (#16). */
  etag = ''
  /** İlk tazeleme bekleniyor (önbellekten hidratlandı) — bant baskılanır (#16). */
  hydratedFromCache = false
  /** Seçili arşiv sezonu (#18 PR2): 0 = aktif sezon. */
  selectedSeason = 0
  archiveLoading = false
  archiveError: string | null = null
  /** Arşiv sezon payload önbelleği — anahtar `${lig}:${sezon}` (#21). */
  private archiveCache: Record<string, any> = {}
  /** Ay takvimi (#19): '' = bugünün ayı. */
  selectedMonthKey = ''
  calendarLoading = false
  calendarError: string | null = null
  /** Oyuncular detay görünümü (#20 U8): '' = kart listesi. leagueStore'da —
   *  route sayfaları leagueStore yazılarına kanıtlanmış biçimde yeniden
   *  render oluyor (uiStore alan yazıları bu sayfayı tetiklemiyordu). */
  selectedPlayerId = ''
  /** Ay takviminin sezon payload önbelleği (sezon başına tek fetch) —
   *  anahtar `${lig}:${sezon}` (#21). */
  private monthSeasonCache: Record<string, any> = {}
  /** #21 Faz 3: İsabet Şampiyonası — diğer aktif ligin payload önbelleği
   *  (oturum başına tek fetch; anahtar lig kodu; kalıcı edilmez). */
  private otherLeagueCache: Record<string, any> = {}
  accuracyLoading = false
  accuracyError: string | null = null

  selectedDate = ''
  statusFilter: StatusFilter = 'all'
  competitionFilter = 'all'

  private seq = 0
  private pollTimer: any = null

  constructor() {
    super()
    this.hydrateLeaguePref()
    this.hydrateFromCache()
  }

  /** #21 Faz 2: kalıcı lig tercihi — basit 'EU'|'TSL' bekçisi (bilinmeyen → EU). */
  private hydrateLeaguePref() {
    try {
      this.league = localStorage.getItem(LEAGUE_PREF_KEY) === 'TSL' ? 'TSL' : 'EU'
    } catch {
      this.league = 'EU'
    }
  }

  /** sessionStorage'dan stale-while-revalidate hidrasyonu (#16). Yalnız
   *  ÖNBELLEKTEKİ lig aktif ligle aynıysa hidratlanır (#21) — aksi halde
   *  yanlış lig verisi parlamasın diye iskelet gösterilir. */
  private hydrateFromCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed?.league !== this.league) return
      const payload = parsed?.payload
      if (!payload?.meta?.season || !Array.isArray(payload?.matches)) return
      if (Date.now() - (parsed.savedAt ?? 0) > CACHE_MAX_AGE_MS) return
      this.data = payload
      this.rememberLeagues(payload)
      this.etag = typeof parsed.etag === 'string' ? parsed.etag : ''
      this.hydratedFromCache = true
    } catch {
      // Bozuk/kota dolu önbellek — sessizce yoksay.
    }
  }

  private saveCache(payload: any) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), etag: this.etag, league: this.league, payload }))
    } catch {
      // Kota/private mod — önbellek yazılamadı, sorun değil.
    }
  }

  async load(silent = false) {
    if (!silent) this.loading = true
    const seq = ++this.seq
    try {
      const res = await fetch(`/api/league?league=${encodeURIComponent(this.league)}`, {
        cache: 'no-store',
        ...(this.etag ? { headers: { 'if-none-match': this.etag } } : {}),
      })
      if (res.status === 304) {
        // İçerik değişmedi (#16): veri elde, yalnız tazelik damgası güncellenir.
        if (seq !== this.seq) return
        this.error = null
        this.consecutiveFailures = 0
        this.hydratedFromCache = false
        this.lastLoadedAt = Date.now()
        return
      }
      if (!res.ok) throw new Error(`Sunucu ${res.status} döndü`)
      const payload = await res.json()
      if (seq !== this.seq) return
      this.data = payload
      this.rememberLeagues(payload)
      this.error = null
      this.consecutiveFailures = 0
      this.hydratedFromCache = false
      this.lastLoadedAt = Date.now()
      this.etag = res.headers.get('etag') ?? ''
      this.saveCache(payload)
      this.ensureSelectedDate()
    } catch (err: any) {
      if (seq !== this.seq) return
      this.consecutiveFailures += 1
      if (!silent || !this.data) this.error = err?.message ?? 'Veri alınamadı.'
    } finally {
      if (seq === this.seq) {
        this.loading = false
        this.schedulePoll()
      }
    }
  }

  private ensureSelectedDate() {
    const dates = this.dateList
    if (dates.length === 0) return
    if (this.selectedDate && dates.some(d => d.key === this.selectedDate)) return
    const today = todayKey()
    const todayEntry = dates.find(d => d.key === today)
    if (todayEntry) {
      this.selectedDate = today
      return
    }
    const future = dates.find(d => d.key > today)
    this.selectedDate = future ? future.key : dates[dates.length - 1].key
  }

  /** Akıllı polling aralığı (#16): canlı 30 sn; gece (01-08 İstanbul) ve maç
   *  yokken 5 dk; aksi halde 2 dk. Sekme gizliyken istek atılmaz (mevcut davranış). */
  private pollDelayMs(): number {
    if (this.hasLive) return 30_000
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: 'numeric', hour12: false }).format(new Date())
    )
    const quietNight = hour >= 1 && hour < 8
    return quietNight ? 300_000 : 120_000
  }

  private schedulePoll() {
    if (this.pollTimer) clearTimeout(this.pollTimer)
    this.pollTimer = setTimeout(() => {
      if (document.visibilityState === 'visible') this.load(true)
      else this.schedulePoll()
    }, this.pollDelayMs())
  }

  refresh() {
    return this.load()
  }

  /** #21 Faz 2: küresel lig değiştirme. Aynı ligde no-op. Lig yazılır +
   *  kalıcı edilir; görünüm durumu (gün/filtre/sezon/ay/oyuncu) sıfırlanır;
   *  etag + arşiv/ay-önbellekleri düşürülür (başka ligin verisi); data=null
   *  → iskelet (yanlış lig parlaması yok); ardından yeni lig çekilir. */
  switchLeague(code: string) {
    if (code === this.league || (code !== 'EU' && code !== 'TSL')) return
    this.league = code
    try {
      localStorage.setItem(LEAGUE_PREF_KEY, code)
    } catch {
      // Private mod — tercih yalnız bu oturumda geçerli.
    }
    this.selectedDate = ''
    this.statusFilter = 'all'
    this.competitionFilter = 'all'
    this.selectedSeason = 0
    this.selectedMonthKey = ''
    this.selectedPlayerId = ''
    this.error = null
    this.archiveError = null
    this.calendarError = null
    this.accuracyError = null
    this.etag = ''
    this.archiveCache = {}
    this.monthSeasonCache = {}
    this.consecutiveFailures = 0
    this.hydratedFromCache = false
    this.data = null
    this.load()
  }

  /** "Geçmiş Sezonlar" seçimi (#18 PR2): sezon verisi ayrı çekilir ve önbelleklenir;
   *  ana `data` (Maçlar/Geçmiş/Tahminlerim/MatchSheet) her zaman aktif sezon kalır. */
  async selectSeason(year: number) {
    this.selectedSeason = year
    if (year === 0) return
    const cacheKey = `${this.league}:${year}`
    if (this.archiveCache[cacheKey]) return
    this.archiveLoading = true
    this.archiveError = null
    try {
      const res = await fetch(`/api/league?season=${year}&league=${encodeURIComponent(this.league)}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Sunucu ${res.status} döndü`)
      this.archiveCache[cacheKey] = await res.json()
    } catch (err: any) {
      this.archiveError = err?.message ?? 'Sezon verisi alınamadı.'
    } finally {
      this.archiveLoading = false
    }
  }

  // --- Ay takvimi (#19) ---

  get calendarMonthKey(): string {
    return this.selectedMonthKey || todayMonthKey()
  }

  get isCurrentMonth(): boolean {
    return this.calendarMonthKey === todayMonthKey()
  }

  /** Ay gezinme: sınırsız geri/ileri; sezon sınırı aşılırsa o sezonun payload'ı çekilir. */
  selectMonth(delta: number) {
    this.selectedMonthKey = shiftMonth(this.calendarMonthKey, delta)
    this.ensureMonthData()
  }

  goToTodayMonth() {
    this.selectedMonthKey = todayMonthKey()
    this.selectedDate = todayKey()
    this.ensureMonthData()
  }

  // --- Oyuncular detay görünümü (#20 U8) ---
  selectPlayer(playerId: string) {
    this.selectedPlayerId = playerId
  }

  closePlayerDetail() {
    this.selectedPlayerId = ''
  }

  /** Gün seçimi: maç listesi o günü; gün başka aydan ise takvim o aya geçer. */
  selectDay(dayKey: string) {
    this.selectedDate = dayKey
    this.selectedMonthKey = dayKey.slice(0, 7)
    this.ensureMonthData()
  }

  /** Seçili ayın sezonu aktif sezon değilse (ve veri yoksa) ?season= ile çek. */
  private ensureMonthData() {
    const parsed = parseMonthKey(this.calendarMonthKey)
    if (!parsed) return
    const season = seasonOfYearMonth(parsed.year, parsed.monthIndex)
    const activeSeason = this.data?.meta?.season?.year
    if (activeSeason == null || season === activeSeason) return
    const cacheKey = `${this.league}:${season}`
    if (this.monthSeasonCache[cacheKey]) return
    this.calendarLoading = true
    this.calendarError = null
    fetch(`/api/league?season=${season}&league=${encodeURIComponent(this.league)}`, { cache: 'no-store' })
      .then(async res => {
        if (!res.ok) throw new Error(`Sunucu ${res.status} döndü`)
        this.monthSeasonCache[cacheKey] = await res.json()
      })
      .catch((err: any) => {
        this.calendarError = err?.message ?? 'Sezon verisi alınamadı.'
      })
      .finally(() => {
        this.calendarLoading = false
      })
  }

  /** Ayın veri kaynağı: aktif sezon payload'ı ya da çekilmiş sezon payload'ı. */
  get calendarSource(): any {
    const parsed = parseMonthKey(this.calendarMonthKey)
    if (!parsed) return this.data
    const season = seasonOfYearMonth(parsed.year, parsed.monthIndex)
    if (season === this.data?.meta?.season?.year) return this.data
    return this.monthSeasonCache[`${this.league}:${season}`] ?? this.data
  }

  // --- #21 performans: takvim memoizasyonu ---
  // Gea getter'ları HER erişimde yeniden değerlenir; 42 hücre ×
  // calendarSummaries/calendarMatchesByDay TSL'nin ~306 maçında her filtre
  // tıklamasında ~550 ms ana iş parçacığını bloklıyordu (profil: %28
  // calendarMatchesByDay + %19 hücre render + %8 calendarSummaries).
  // Referans-anahtarlı önbellek: geçerlilik kontrolü ilgili store alanını
  // (calendarSource/data/calendarMonthKey) OKUDUĞU için reaktif bağımlılık
  // zinciri aynen korunur — kaynak değişince önbellek kendiliğinden düşer.

  private calWeeksCache: { monthKey: string; out: any } | null = null
  private calByDayCache: { source: any; out: any } | null = null
  private calSummariesCache: { monthKey: string; byDay: any; out: any } | null = null
  private calStatsCache: { monthKey: string; byDay: any; out: any } | null = null
  private byDayCache: { data: any; out: any } | null = null
  private matchWeekCache: { data: any; out: Record<string, number> } | null = null

  /** Ay matrisi — türetme store getter'ında (Gea kuralı 7); hücre anahtarları
   *  ay bazlıdır: ay değişince tüm hücreler yeniden doğar (geçiş animasyonu).
   *  Ay bazlı önbellekli: monthMatrix saf fonksiyon, aynı ay aynı sonuç. */
  get calendarWeeks(): Array<Array<{ cellId: string; dayKey: string; day: number; inMonth: boolean }>> {
    const monthKey = this.calendarMonthKey
    if (this.calWeeksCache?.monthKey === monthKey) return this.calWeeksCache.out
    const out = monthMatrix(monthKey).map(week =>
      week.map(cell => ({ cellId: `${monthKey}:${cell.dayKey}`, ...cell }))
    )
    this.calWeeksCache = { monthKey, out }
    return out
  }

  /** Ayın maçlarını gün anahtarıyla grupla (kaynak: seçili ayın sezonu).
   *  Kaynak (calendarSource) referansı değişmedikçe gruplama tekrar etmez. */
  get calendarMatchesByDay(): Record<string, any[]> {
    const source = this.calendarSource
    if (this.calByDayCache?.source === source) return this.calByDayCache.out
    const byDay: Record<string, any[]> = {}
    for (const m of source?.matches ?? []) {
      const key = dateKey(m.kickoff)
      ;(byDay[key] ??= []).push(m)
    }
    this.calByDayCache = { source, out: byDay }
    return byDay
  }

  /** Tüm görünür günlerin hücre özetleri — hücreler tek adım store erişimiyle
   *  okur. (ay + gün-gruplaması) referans çiftiyle önbelleklenir. */
  get calendarSummaries(): Record<string, any> {
    const monthKey = this.calendarMonthKey
    const byDay = this.calendarMatchesByDay
    if (
      this.calSummariesCache?.monthKey === monthKey &&
      this.calSummariesCache?.byDay === byDay
    ) {
      return this.calSummariesCache.out
    }
    const out: Record<string, any> = {}
    for (const week of this.calendarWeeks) {
      for (const cell of week) {
        out[cell.dayKey] = summarizeDay(cell.dayKey, byDay[cell.dayKey] ?? [])
      }
    }
    this.calSummariesCache = { monthKey, byDay, out }
    return out
  }

  /** Ay özeti (#20 E1/E2): seçili ayın maç/canlı/bitti sayıları + bugün.
   *  Önbellek anahtarı calendarSummaries ile aynı referans çifti. */
  get calendarMonthStats(): { total: number; live: number; finished: number; todayCount: number } {
    const monthKey = this.calendarMonthKey
    const byDay = this.calendarMatchesByDay
    if (
      this.calStatsCache?.monthKey === monthKey &&
      this.calStatsCache?.byDay === byDay
    ) {
      return this.calStatsCache.out
    }
    const prefix = monthKey
    const today = todayKey()
    let total = 0
    let live = 0
    let finished = 0
    let todayCount = 0
    for (const dayKey of Object.keys(byDay)) {
      if (!dayKey.startsWith(prefix)) continue
      for (const m of byDay[dayKey]) {
        total++
        if (m.isLive) live++
        else if (m.isFinished) finished++
      }
      if (dayKey === today) todayCount = byDay[dayKey].length
    }
    const out = { total, live, finished, todayCount }
    this.calStatsCache = { monthKey, byDay, out }
    return out
  }

  onVisibilityGained() {
    if (Date.now() - this.lastLoadedAt > this.pollDelayMs() / 2) this.load(true)
  }

  // --- Hesaplanmış görünüm verileri ---

  get dateList(): Array<{ key: string; count: number; hasLive: boolean; isToday: boolean }> {
    const matches = this.data?.matches ?? []
    const map = new Map<string, { count: number; hasLive: boolean }>()
    for (const m of matches) {
      const key = dateKey(m.kickoff)
      const entry = map.get(key) ?? { count: 0, hasLive: false }
      entry.count += 1
      if (m.isLive) entry.hasLive = true
      map.set(key, entry)
    }
    const today = todayKey()
    if (!map.has(today)) map.set(today, { count: 0, hasLive: false })
    return [...map.entries()]
      .map(([key, v]) => ({ key, ...v, isToday: key === today }))
      .sort((a, b) => (a.key < b.key ? -1 : 1))
  }

  get matchesOfSelectedDate(): any[] {
    // Gün başka sezondaysa o sezonun payload'ından oku (#19 ay takvimi).
    const source = this.selectedDateSource
    return (source?.matches ?? []).filter(m => dateKey(m.kickoff) === this.selectedDate)
  }

  private get selectedDateSource(): any {
    const mk = this.selectedDate ? this.selectedDate.slice(0, 7) : ''
    const parsed = mk ? parseMonthKey(mk) : null
    if (!parsed) return this.data
    const season = seasonOfYearMonth(parsed.year, parsed.monthIndex)
    if (season === this.data?.meta?.season?.year) return this.data
    return this.monthSeasonCache[`${this.league}:${season}`] ?? this.data
  }

  /** Gün anahtarı → o günün maçları (saat sırasına göre). Önizleme popover'ı
   *  için. data referansıyla önbellekli (#21 performans — TSL ~306 maç). */
  get matchesByDay(): Record<string, any[]> {
    const data = this.data
    if (this.byDayCache?.data === data) return this.byDayCache.out
    const byDay: Record<string, any[]> = {}
    for (const m of data?.matches ?? []) {
      const key = dateKey(m.kickoff)
      ;(byDay[key] ??= []).push(m)
    }
    for (const key of Object.keys(byDay)) {
      byDay[key].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
    }
    this.byDayCache = { data, out: byDay }
    return byDay
  }

  get filteredMatches(): any[] {
    let list = this.matchesOfSelectedDate
    if (this.statusFilter !== 'all') {
      list = list.filter(m => {
        if (this.statusFilter === 'live') return m.isLive
        if (this.statusFilter === 'finished') return m.isFinished
        if (this.statusFilter === 'upcoming') return m.statusGroup === 'upcoming' && !m.isStarted
        return true
      })
    }
    if (this.competitionFilter !== 'all') {
      list = list.filter(m => m.competitionCode === this.competitionFilter)
    }
    return list
  }

  /** #21 UI: Süper Lig maçının hafta numarası (matchId → 1'den başlayan tur).
   *  ESPN tur.1 kaynaklarında week YOK (scoreboard + core API doğrulandı;
   *  leagues[].calendar de boş) → tur KÜMELEMESİYLE türetilir:
   *  (a) önceki maçtan >2 gün boşluk VEYA (b) takım bu turda zaten oynadı →
   *  yeni tur. Cuma–Pazartesi turları art arda günlerde akar; milli ara ve
   *  aynı haftadaki iki tur doğru ayrışır. <4 maçlık kümeler (ertelenen maç
   *  telafisi) önceki tura katılır. Gerçeklikle doğrulandı (2026-10-26):
   *  2026-27 sezonu 16 tur × tam 9 maç; GS-FB derbisi = 9. tur; son biten
   *  tur 9 — resmi fikstür numaralandırmasıyla birebir örtüşüyor.
   *  Arşiv/sezon-öncesi aylarda maç bu haritada yoktur → bileşen çipi gizler.
   *  Türetme store getter'ında (Gea kuralı 7); referans-anahtarlı önbellek
   *  (data referansı değişmedikçe yeniden hesaplanmaz, reaktivite korunur). */
  get matchWeekByMatchId(): Record<string, number> {
    const data = this.data
    if (this.matchWeekCache?.data === data) return this.matchWeekCache.out
    const dayOf = (iso: string) => Math.floor(Date.parse(iso) / 86400000)
    const clusters: Array<{ lastDay: number; teams: Set<string>; items: any[] }> = []
    const matches = [...(data?.matches ?? [])].sort(
      (a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff),
    )
    for (const m of matches) {
      const prev = clusters[clusters.length - 1]
      // DİKKAT: lastDay zaten gün sayısıdır — yeniden dayOf()'a SOKMA
      // (çifte dönüşüm hatası: her maç tekil küme üretir).
      const gapNew = !prev || dayOf(m.kickoff) - prev.lastDay > 2
      const teamNew = !gapNew && (prev.teams.has(m.home.name) || prev.teams.has(m.away.name))
      if (gapNew || teamNew) {
        clusters.push({ lastDay: dayOf(m.kickoff), teams: new Set([m.home.name, m.away.name]), items: [m] })
      } else {
        prev.lastDay = dayOf(m.kickoff)
        prev.teams.add(m.home.name)
        prev.teams.add(m.away.name)
        prev.items.push(m)
      }
    }
    const out: Record<string, number> = {}
    let week = 0
    for (const cluster of clusters) {
      // Ertelenen maçın telafisi (<4 maç) önceki turun numarasını alır.
      if (cluster.items.length < 4 && week > 0) {
        for (const m of cluster.items) out[m.id] = week
        continue
      }
      week += 1
      for (const m of cluster.items) out[m.id] = week
    }
    this.matchWeekCache = { data, out }
    return out
  }

  /** Filtrelenmiş maçlar, turnuva bazında gruplanmış. */
  get groupedMatches(): Array<{ code: string; name: string; matches: any[] }> {
    const comps = this.data?.competitions ?? []
    const groups = []
    for (const comp of comps) {
      const matches = this.filteredMatches.filter(m => m.competitionCode === comp.code)
      if (matches.length > 0) groups.push({ code: comp.code, name: comp.name, matches })
    }
    return groups
  }

  get liveMatches(): any[] {
    return (this.data?.matches ?? []).filter(m => m.isLive)
  }

  get finishedMatches(): any[] {
    return (this.data?.matches ?? []).filter(m => m.isFinished)
  }

  getMatch(id: string) {
    return (this.data?.matches ?? []).find(m => m.id === id) ?? null
  }

  get standings(): any[] {
    return this.data?.standings ?? []
  }

  get players(): any[] {
    return this.data?.players ?? []
  }

  get competitions(): any[] {
    return this.data?.competitions ?? []
  }

  /** #21 UI: seçilebilir ligler. Payload'daki meta.leagues birincil
   *  kaynaktır; lig geçişinde data=null olur (iskelet) — değiştiricinin
   *  KAYBOLMAMASI için son görünen liste yedekte tutulur (kullanıcı
   *  geri bildirimi: buton yok olup geri geliyordu). */
  private leaguesSeen: Array<{ code: string; name: string }> = []

  get leagueOptions(): Array<{ code: string; name: string }> {
    const fromPayload = this.data?.meta?.leagues ?? []
    if (fromPayload.length > 0) return fromPayload
    return this.leaguesSeen
  }

  /** meta.leagues'i kalıcı yedeğe al (load/hydrate başarı yolunda çağrılır). */
  private rememberLeagues(payload: any) {
    const leagues = payload?.meta?.leagues
    if (Array.isArray(leagues) && leagues.length > 0) this.leaguesSeen = leagues
  }

  // --- #21 Faz 3: İsabet Şampiyonası + Haftanın Tahmincisi ---

  /** Aktif ligin dışındaki ilk aktif lig (İsabet Şampiyonası'nın ikinci
   *  sütunu); tek ligli payload'da '' → görünüm gizli kalır. */
  get otherLeagueCode(): string {
    const option = this.leagueOptions.find(lg => lg.code !== this.league)
    return option?.code ?? ''
  }

  /** Diğer ligin payload'ı — oturum başına tek fetch (otherLeagueCache).
   *  Başarısızlıkta hata yazılır; yeniden deneme düğmesi tekrar çağırır. */
  async ensureOtherLeague() {
    const code = this.otherLeagueCode
    if (!code || this.otherLeagueCache[code]) return
    this.accuracyLoading = true
    this.accuracyError = null
    try {
      const res = await fetch(`/api/league?league=${encodeURIComponent(code)}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Sunucu ${res.status} döndü`)
      this.otherLeagueCache[code] = await res.json()
    } catch (err: any) {
      this.accuracyError = err?.message ?? 'Lig verisi alınamadı.'
    } finally {
      this.accuracyLoading = false
    }
  }

  /** İsabet Şampiyonası: iki ligin puan satırları oyuncu id'de birleşir.
   *  Sıralama: genel isabet (totalCorrect/totalPlayed) desc → doğru sayısı
   *  desc → isim (tr). Türetme tamamen getter'da (Gea kuralı 7). */
  get accuracyChampionship(): any[] {
    const otherCode = this.otherLeagueCode
    const other = otherCode ? this.otherLeagueCache[otherCode] : null
    if (!this.data || !other) return []
    const rows = new Map<string, any>()
    const mergeLeague = (code: string, standings: any[]) => {
      for (const row of standings) {
        const merged = rows.get(row.id) ?? {
          id: row.id,
          name: row.name,
          color: row.color,
          initials: row.initials,
          avatarUrl: row.avatarUrl ?? null,
          stats: {},
          totalPlayed: 0,
          totalCorrect: 0,
        }
        merged.stats[code] = { played: row.played, correct: row.correctOutcomes, accuracy: row.accuracy }
        merged.totalPlayed += row.played
        merged.totalCorrect += row.correctOutcomes
        rows.set(row.id, merged)
      }
    }
    mergeLeague(this.league, this.data.standings ?? [])
    mergeLeague(otherCode, other.standings ?? [])
    const list = [...rows.values()].map(row => ({
      ...row,
      general: row.totalPlayed > 0 ? Math.round((row.totalCorrect / row.totalPlayed) * 100) : 0,
    }))
    list.sort((a, b) => {
      if (b.general !== a.general) return b.general - a.general
      if (b.totalCorrect !== a.totalCorrect) return b.totalCorrect - a.totalCorrect
      return a.name.localeCompare(b.name, 'tr')
    })
    return list.map((row, index) => ({ ...row, rank: index + 1 }))
  }

  /** Haftanın tahmincisi: bitmiş maçların EN SON ISO haftasında (pazartesi
   *  başlangıç) en çok doğru tahmin yapan oyuncu(lar). Doğru yoksa null. */
  get weeklyTop(): { names: string[]; correctCount: number; weekStart: string; weekEnd: string } | null {
    const finished = this.finishedMatches
    if (finished.length === 0) return null
    let latestWeek = ''
    for (const match of finished) {
      const week = isoMondayKey(match.kickoff)
      if (week > latestWeek) latestWeek = week
    }
    const namesById = new Map<string, string>()
    const counts = new Map<string, number>()
    for (const match of finished) {
      if (isoMondayKey(match.kickoff) !== latestWeek) continue
      for (const pred of match.predictions ?? []) {
        namesById.set(pred.playerId, pred.name)
        if (pred.correct === true) counts.set(pred.playerId, (counts.get(pred.playerId) ?? 0) + 1)
      }
    }
    let best = 0
    for (const value of counts.values()) {
      if (value > best) best = value
    }
    if (best === 0) return null
    const names: string[] = []
    for (const entry of counts.entries()) {
      if (entry[1] !== best) continue
      names.push(namesById.get(entry[0]) ?? 'Oyuncu')
    }
    names.sort((a, b) => a.localeCompare(b, 'tr'))
    return { names, correctCount: best, weekStart: latestWeek, weekEnd: shiftDay(latestWeek, 6) }
  }

  /** Podyum sırası: 2.-1.-3. */
  get podiumOrder(): any[] {
    const top3 = this.standings.slice(0, 3)
    return top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3
  }

  /** Bitmiş maçlar gün bazında, en yeni gün önce. */
  get resultsByDay(): Array<{ day: string; matches: any[] }> {
    const finished = [...this.finishedMatches].sort(
      (a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff)
    )
    const byDay = new Map<string, any[]>()
    for (const match of finished) {
      const key = dateKey(match.kickoff)
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key).push(match)
    }
    return [...byDay.entries()].map(entry => ({ day: entry[0], matches: entry[1] }))
  }

  get hasLive(): boolean {
    return this.liveMatches.length > 0
  }

  /**
   * Bayatlık durumu (#18 bayatlık politikası): global uyarı bandının ve canlı
   * satırlardaki "SON BİLGİ" dürüstlük etiketinin kaynağı.
   * Formül: (lastError && lastAttempt > lastSuccess) VEYA yaş > eşik;
   * eşikler senkron eşiklerinin belirgin üstünde: canlı 5 dk, yaklaşan
   * maç (≤6 sa) 30 dk, aksi halde 3 saat.
   */
  get staleInfo(): { level: 'none' | 'stale' | 'offline'; sinceIso: string | null } {
    if (!this.data) return { level: 'none', sinceIso: null }
    // Önbellekten hidratlandı ve ilk tazeleme bekleniyor (#16): bant henüz
    // anlamsız — veri arkadan geliyor, "alınamıyor" demek yanlış olur.
    if (this.hydratedFromCache) return { level: 'none', sinceIso: null }
    if (this.consecutiveFailures >= 2) {
      return { level: 'offline', sinceIso: this.data.meta?.generatedAt ?? null }
    }
    const sync = this.data.meta?.sync
    const lastSuccess = sync?.lastSuccessAt ? Date.parse(sync.lastSuccessAt) : 0
    const lastAttempt = sync?.lastAttemptAt ? Date.parse(sync.lastAttemptAt) : 0
    const ageMin = lastSuccess ? (Date.now() - lastSuccess) / 60_000 : Number.POSITIVE_INFINITY
    const upcomingSoon = (this.data.matches ?? []).some((m: any) => {
      if (m.isLive || m.isFinished || m.isStarted) return false
      const diff = Date.parse(m.kickoff) - Date.now()
      return diff < 6 * 3_600_000 && diff > -30 * 60_000
    })
    const threshold = this.hasLive ? 5 : upcomingSoon ? 30 : 180
    const failing = Boolean(sync?.lastError) && lastAttempt > lastSuccess
    if (failing || ageMin > threshold) {
      return { level: 'stale', sinceIso: this.data.meta?.generatedAt ?? null }
    }
    return { level: 'none', sinceIso: null }
  }

  get staleActive(): boolean {
    return this.staleInfo.level !== 'none'
  }

  /** Oyuncu kartları için tahmin durumu özeti (#20 U8 + E4):
   *  sealed = mühürlü girilen, missing = bitmemiş ama girilmemiş,
   *  form = son 5 bitmiş tahminin G/M dizisi (payload'dan ücretsiz türetim). */
  get playerPredictionStats(): Record<string, { sealed: number; missing: number; form: string[] }> {
    const players = this.data?.players ?? []
    const matches = this.data?.matches ?? []
    const out: Record<string, { sealed: number; missing: number; form: string[] }> = {}
    for (const p of players) {
      let sealed = 0
      let missing = 0
      const form: string[] = []
      for (const m of matches) {
        const pred = (m.predictions ?? []).find((x: any) => x.playerId === p.id)
        if (!pred) {
          if (!m.isStarted && !m.isFinished && m.statusGroup !== 'inactive') missing++
          continue
        }
        if (!m.predictionsVisible) {
          sealed++
          continue
        }
        if (m.isFinished && pred.correct === true) form.push('G')
        else if (m.isFinished && pred.correct === false) form.push('M')
      }
      out[p.id] = { sealed, missing, form: form.slice(-5) }
    }
    return out
  }

  /** Akış olayları (#20 U9): son tahmin girişleri (mühürlü) + sonuçlar. */
  get flowEvents(): any[] {
    const data = this.data
    if (!data) return []
    return buildFlowEvents({
      recentPredictions: data.recentPredictions ?? [],
      matches: data.matches ?? [],
      players: data.players ?? [],
    })
  }

  // --- Sezonlar (#18 PR2) ---

  /** meta.seasons (desc, ilk öğe aktif sezon). */
  get seasonsList(): Array<{ year: number; label: string }> {
    return this.data?.meta?.seasons ?? []
  }

  get activeSeasonLabel(): string {
    return this.seasonsList[0]?.label ?? 'Bu sezon'
  }

  /** Aktif sezon dışındaki sezonlar (desc) — türetme store getter'ında (Gea kuralı). */
  get pastSeasons(): Array<{ year: number; label: string }> {
    return this.seasonsList.slice(1)
  }

  /** Puan Durumu sayfasının verisi: seçili arşiz sezonu ya da aktif sezon. */
  get standingsData(): any {
    if (this.selectedSeason === 0) return this.data
    return this.archiveCache[`${this.league}:${this.selectedSeason}`] ?? null
  }

  get loadingInitial(): boolean {
    return this.loading && !this.data
  }
}

export default new LeagueStore()
