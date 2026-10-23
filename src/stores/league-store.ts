// Lig verisi: yükleme, adaptif polling, görünüm filtreleri.

import { Store } from '@geajs/core'
import { dateKey, todayKey } from '../utils/format'

export type StatusFilter = 'all' | 'live' | 'upcoming' | 'finished'

class LeagueStore extends Store {
  data: any = null
  loading = false
  error: string | null = null
  lastLoadedAt = 0

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
      this.lastLoadedAt = Date.now()
      this.ensureSelectedDate()
    } catch (err: any) {
      if (seq !== this.seq) return
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

  get hasLive(): boolean {
    return this.liveMatches.length > 0
  }

  get loadingInitial(): boolean {
    return this.loading && !this.data
  }
}

export default new LeagueStore()
