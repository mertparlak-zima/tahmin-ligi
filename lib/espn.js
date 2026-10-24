// ESPN public scoreboard entegrasyonu.
// Üç turnuva da ESPN'den okunur: CL=uefa.champions, EL=uefa.europa, UECL=uefa.europa.conf
// Endpoint: /scoreboard?dates={yil}&limit=500 (takvim yılı bazlı; sezon 2 yıl taranır)

import { applyCanonicalSide, isTrackedMatch } from './targets.js'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

const SLUGS = {
  CL: 'uefa.champions',
  EL: 'uefa.europa',
  UECL: 'uefa.europa.conf',
}

const FETCH_TIMEOUT_MS = 6_000
const RETRY_DELAYS_MS = [1_500, 3_000]
const DEFAULT_DEADLINE_MS = 15_000 // tüm fetch aşamasının toplam bütçesi (P3)

/** Avrupa sezonu başlangıç yılı: Temmuz ve sonrası aynı yıl, değilse bir önceki yıl. */
export function seasonYear(now = new Date()) {
  const y = now.getUTCFullYear()
  return now.getUTCMonth() + 1 >= 7 ? y : y - 1
}

/**
 * Toplam fetch bütçesi (P3): deadline dolunca uçan AbortController'lar
 * abort edilir ve yeni deneme açılamaz. Bütçe abort'u, zaman aşımı
 * AbortError'undan ayrışsın diye özel hata (budgetExceeded) kullanır —
 * retry edilemez, kaynak hatası sayılır (complete=false).
 */
class FetchBudget {
  constructor(deadlineMs) {
    this.deadlineAt = Date.now() + Math.max(0, deadlineMs)
    this.expired = false
    this.timer = null
    this.entries = new Set() // { controller, timer } — uçan istekler
    this.waiters = new Set() // bütçe bitişini bekleyen işler
    if (this.deadlineAt <= Date.now()) this.fire()
    else this.timer = setTimeout(() => this.fire(), this.deadlineAt - Date.now())
  }

  error() {
    return Object.assign(new Error('senkron bütçesi aşıldı'), { budgetExceeded: true })
  }

  fire() {
    if (this.expired) return
    this.expired = true
    if (this.timer) clearTimeout(this.timer)
    for (const { controller, timer } of this.entries) {
      clearTimeout(timer) // askıda kalan deneme sürelerini event loop'ta tutma
      controller.abort(this.error())
    }
    this.entries.clear()
    for (const waiter of this.waiters) waiter()
    this.waiters.clear()
  }

  track(controller, timer) {
    this.entries.add({ controller, timer })
  }

  untrack(controller) {
    for (const entry of this.entries) {
      if (entry.controller === controller) this.entries.delete(entry)
    }
  }

  /** Bütçe bitince fn çağrılır (halihazırda bitmişse hemen). */
  onExpire(fn) {
    if (this.expired) fn()
    else this.waiters.add(fn)
  }

  /** Tüm işler tamamlandıysa deadline timer'ını bırak (process'i bekletme). */
  dispose() {
    if (!this.expired && this.timer) clearTimeout(this.timer)
  }
}

async function fetchJson(url, budget, attempt = 0) {
  // Yeni deneme açılmadan ÖNCE kalan bütçe kontrol edilir.
  if (budget.expired) throw budget.error()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  budget.track(controller, timer)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (res.status === 429 || res.status >= 500) {
      throw Object.assign(new Error(`HTTP ${res.status}`), { retryable: true })
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    // Bütçe abort'u (budgetExceeded) retryable DEĞİL; timeout AbortError retryable kalır.
    const retryable = !err.budgetExceeded && (err.retryable || err.name === 'AbortError' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET')
    if (retryable && attempt < RETRY_DELAYS_MS.length) {
      if (budget.expired) throw budget.error()
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]))
      return fetchJson(url, budget, attempt + 1)
    }
    throw err
  } finally {
    budget.untrack(controller)
    clearTimeout(timer)
  }
}

function parseScore(raw) {
  if (raw == null) return null
  const text = typeof raw === 'object' ? (raw.displayValue ?? raw.value) : raw
  if (text == null) return null
  const s = String(text).trim()
  if (s === '' || s === '-' || s === '–') return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

function parseMinute(displayClock) {
  const m = parseInt(String(displayClock ?? ''), 10)
  return Number.isFinite(m) ? Math.min(m, 130) : null
}

function normalizeStatus(competition, status) {
  const name = String(status?.type?.name ?? '')
  if (name === 'STATUS_POSTPONED') return 'POSTPONED'
  if (name === 'STATUS_CANCELED' || name === 'STATUS_CANCELLED') return 'CANCELLED'
  if (name === 'STATUS_SUSPENDED') return 'SUSPENDED'
  const state = status?.type?.state
  if (state === 'post') return 'FINISHED'
  if (state === 'in') return /HALFTIME|END_PERIOD/.test(name) ? 'PAUSED' : 'IN_PLAY'
  return competition?.timeValid === false ? 'SCHEDULED' : 'TIMED'
}

const SCORELESS_STATUSES = ['SCHEDULED', 'TIMED', 'POSTPONED', 'CANCELLED', 'SUSPENDED']

function sideFrom(competitor, score) {
  const team = competitor?.team ?? {}
  return {
    name: team.displayName ?? team.name ?? 'Bilinmiyor',
    short: team.shortDisplayName ?? team.displayName ?? team.name ?? 'Bilinmiyor',
    tla: team.abbreviation ?? null,
    crest: team.logo ?? null,
    score,
  }
}

function normalizeEvent(competitionCode, event) {
  const competition = event.competitions?.[0]
  if (!competition) return null
  const competitors = competition.competitors ?? []
  const home = competitors.find(c => c.homeAway === 'home')
  const away = competitors.find(c => c.homeAway === 'away')
  if (!home || !away) return null

  const status = normalizeStatus(competition, event.status)
  const withScore = !SCORELESS_STATUSES.includes(status)

  let homeSide = sideFrom(home, withScore ? parseScore(home.score) : null)
  let awaySide = sideFrom(away, withScore ? parseScore(away.score) : null)

  // Takip edilen takımın adı her zaman kanonik Türkçe yazımla saklanır.
  homeSide = applyCanonicalSide(homeSide)
  awaySide = applyCanonicalSide(awaySide)

  return {
    provider: 'espn',
    externalId: String(event.id),
    competitionCode,
    kickoff: event.date,
    status,
    minute: ['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'].includes(status)
      ? parseMinute(event.status?.displayClock)
      : null,
    home: homeSide,
    away: awaySide,
    matchday: event.week?.number ?? null,
    stage: event.season?.slug ? String(event.season.slug).toUpperCase() : null,
  }
}

/**
 * Takip edilen maçları ESPN'den çeker.
 * Dönüş: { matches, complete, errors }
 * complete=false → bazı kaynaklar hata verdi; eski veriler korunmalı.
 * opts.deadlineMs → tüm fetch aşamasının toplam bütçesi (varsayılan 15 sn,
 * P3). Bütçe bitince uçan istekler abort edilir; hiç sonuç gelmeyen kaynaklar
 * "senkron bütçesi aşıldı" hatasıyla tur içinde döner (tur asılı kalmaz).
 */
export async function fetchTrackedMatches(now = new Date(), opts = {}) {
  const season = seasonYear(now)
  const budget = new FetchBudget(opts.deadlineMs ?? DEFAULT_DEADLINE_MS)
  const jobs = []
  for (const [code, slug] of Object.entries(SLUGS)) {
    for (const year of [season, season + 1]) {
      const label = `${slug}/${year}`
      // İş, kendi fetch'i ile bütçe bitişi arasında yarışır: kaynak askıda
      // kalsa (hiç çözülmese) bile iş bütçe içinde hata sonucuyla çözülür.
      jobs.push(Promise.race([
        fetchJson(`${ESPN_BASE}/${slug}/scoreboard?dates=${year}&limit=500`, budget)
          .then(json => ({ code, season, events: json?.events ?? [] }))
          .catch(err => ({ code, season, events: null, error: `${label}: ${err.message}` })),
        new Promise(resolve => budget.onExpire(() =>
          resolve({ code, season, events: null, error: `${label}: senkron bütçesi aşıldı` }))),
      ]))
    }
  }
  let results
  try {
    results = await Promise.all(jobs)
  } finally {
    budget.dispose()
  }

  const errors = results.filter(r => r.error).map(r => r.error)
  const byEventId = new Map()

  for (const result of results) {
    if (!result.events) continue
    for (const event of result.events) {
      if (event?.season?.year !== result.season) continue // sezon filtresi
      if (byEventId.has(String(event.id))) continue // iki yıl arasında dedupe
      const match = normalizeEvent(result.code, event)
      if (!match) continue
      if (!isTrackedMatch(match.home.name, match.away.name)) continue
      byEventId.set(String(event.id), match)
    }
  }

  const matches = [...byEventId.values()].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
  return { matches, complete: errors.length === 0 && matches.length > 0, errors }
}
