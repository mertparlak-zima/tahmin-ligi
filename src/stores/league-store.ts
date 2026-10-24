// Lig verisi: yükleme, adaptif polling, görünüm filtreleri.

import { Store } from '@geajs/core'
import { dateKey, todayKey } from '../utils/format'

export type StatusFilter = 'all' | 'live' | 'upcoming' | 'finished'

class LeagueStore extends Store {
  data: any = null
  loading = false
  error: string | null = null
  lastLoadedAt = 0
  /** Art arda başarısız polling sayısı — bağlantı göstergesi için (#18). */
  consecutiveFailures = 0
  /** Seçili arşiv sezonu (#18 PR2): 0 = aktif sezon. */
  selectedSeason = 0
  archiveLoading = false
  archiveError: string | null = null
  private archiveCache: Record<number, any> = {}

  selectedDate = ''
  statusFilter: StatusFilter = 'all'
  competitionFilter = 'all'

  private seq = 0
  private pollTimer: any = null

  async load(silent = false) {
    if (!silent) this.loading = true
    const seq = ++this.seq
    try {
      const res = await fetch('/api/league', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Sunucu ${res.status} döndü`)
      const payload = await res.json()
      if (seq !== this.seq) return
      this.data = payload
      this.error = null
      this.consecutiveFailures = 0
      this.lastLoadedAt = Date.now()
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

  private schedulePoll() {
    if (this.pollTimer) clearTimeout(this.pollTimer)
    const hasLive = (this.data?.matches ?? []).some((m: any) => m.isLive)
    const delay = hasLive ? 30_000 : 60_000
    this.pollTimer = setTimeout(() => {
      if (document.visibilityState === 'visible') this.load(true)
      else this.schedulePoll()
    }, delay)
  }

  refresh() {
    return this.load()
  }

  /** "Geçmiş Sezonlar" seçimi (#18 PR2): sezon verisi ayrı çekilir ve önbelleklenir;
   *  ana `data` (Maçlar/Geçmiş/Tahminlerim/MatchSheet) her zaman aktif sezon kalır. */
  async selectSeason(year: number) {
    this.selectedSeason = year
    if (year === 0) return
    if (this.archiveCache[year]) return
    this.archiveLoading = true
    this.archiveError = null
    try {
      const res = await fetch(`/api/league?season=${year}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Sunucu ${res.status} döndü`)
      this.archiveCache[year] = await res.json()
    } catch (err: any) {
      this.archiveError = err?.message ?? 'Sezon verisi alınamadı.'
    } finally {
      this.archiveLoading = false
    }
  }

  onVisibilityGained() {
    if (Date.now() - this.lastLoadedAt > 45_000) this.load(true)
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
    const matches = this.data?.matches ?? []
    return matches.filter(m => dateKey(m.kickoff) === this.selectedDate)
  }

  /** Gün anahtarı → o günün maçları (saat sırasına göre). Önizleme popover'ı için. */
  get matchesByDay(): Record<string, any[]> {
    const byDay: Record<string, any[]> = {}
    for (const m of this.data?.matches ?? []) {
      const key = dateKey(m.kickoff)
      ;(byDay[key] ??= []).push(m)
    }
    for (const key of Object.keys(byDay)) {
      byDay[key].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
    }
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
    return this.archiveCache[this.selectedSeason] ?? null
  }

  get loadingInitial(): boolean {
    return this.loading && !this.data
  }
}

export default new LeagueStore()
