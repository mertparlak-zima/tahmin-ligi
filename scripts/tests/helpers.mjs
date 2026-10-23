// Paylaşımlı offline test yardımcıları: mini koşucu, in-memory supabase
// adaptörü (demo-server.mjs'teki Query'den uyarlandı; supabase-js
// davranışına daha sadık: single() boş sonuçta PGRST116 döndürür,
// players.lower(name) benzersizlik ihlali 23505 döndürür), fetch stub,
// ESPN event fikstür üreticisi.
//
// Kullanım: node scripts/tests/server.test.mjs

import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const hour = 3600_000
export const iso = ms => new Date(ms).toISOString()

const clone = v => structuredClone(v)

// --- Mini test koşucu (framework yok, assert tabanlı) ---

function indent(text) {
  return String(text)
    .split('\n')
    .slice(0, 8)
    .map(l => `      ${l}`)
    .join('\n')
}

export function createSuite(name) {
  const tests = []
  return {
    name,
    test(title, fn) {
      tests.push({ title, fn })
    },
    async run() {
      let pass = 0
      let fail = 0
      console.log(`\n== ${name} ==`)
      for (const t of tests) {
        try {
          await t.fn()
          pass += 1
          console.log(`  ✓ ${t.title}`)
        } catch (err) {
          fail += 1
          console.log(`  ✗ ${t.title}`)
          console.log(indent(err?.stack ?? String(err)))
        }
      }
      console.log(`-- ${name}: ${pass} geçti, ${fail} kaldı --`)
      return { name, pass, fail }
    },
  }
}

/** Test dosyası doğrudan çalıştırıldığında suite'i koşar. */
export async function runIfMain(suite) {
  const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
  if (!isMain) return
  const result = await suite.run()
  process.exitCode = result.fail > 0 ? 1 : 0
}

// --- In-memory supabase-js adaptörü ---
//
// Query zinciri demo-server.mjs'tekiyle aynı alt kümeyi destekler
// (select/order/eq/in/insert/upsert/delete/update/maybeSingle/single/head-count,
// thenable). Ekstra sadakat:
//   * single() tam 1 satır değilse { code:'PGRST116' } hatası döndürür
//     (gerçek PostgREST davranışı — updatePlayer 404 yolunu test edebilmek için).
//   * players tablosunda lower(name) benzersizlik ihlali 23505 döndürür
//     (gerçek DB'deki unique index taklidi — createPlayer/updatePlayer
//     hata eşlemesini offline test edebilmek için).

class Query {
  constructor(store, table, hooks) {
    this.store = store
    this.table = table
    this.hooks = hooks ?? {}
    this.op = 'select'
    this.filters = []
    this.orderSpec = null
    this.rows = null
    this.patch = null
    this.conflict = null
    this.selectOpts = null
    this.pendingInsert = undefined
    this.mode = null // maybeSingle | single
  }

  select(_cols, opts) {
    this.op = 'select'
    this.selectOpts = opts ?? null
    return this
  }

  order(col, opts) {
    this.orderSpec = { col, asc: opts?.ascending !== false }
    return this
  }

  eq(col, val) {
    this.filters.push(row => row[col] === val)
    return this
  }

  in(col, vals) {
    this.filters.push(row => vals.includes(row[col]))
    return this
  }

  insert(row) {
    this.op = 'insert'
    this.pendingInsert = row
    return this
  }

  upsert(rows, opts) {
    this.op = 'upsert'
    this.rows = Array.isArray(rows) ? rows : [rows]
    this.conflict = opts?.onConflict ?? null
    return this
  }

  update(patch) {
    this.op = 'update'
    this.patch = patch
    return this
  }

  delete() {
    this.op = 'delete'
    return this
  }

  maybeSingle() {
    this.mode = 'maybeSingle'
    return this
  }

  single() {
    this.mode = 'single'
    return this
  }

  then(resolve, reject) {
    return Promise.resolve(this.exec()).then(resolve, reject)
  }

  exec() {
    const table = this.store[this.table] ?? (this.store[this.table] = [])
    const filtered = table.filter(row => this.filters.every(f => f(row)))
    const uniqueError = (incoming, excludeId) =>
      this.hooks.unique?.(this.table, incoming, excludeId) ?? null

    // insert(...).select(...).single() zinciri: satırı ekle, sonra seç.
    if (this.op === 'select' && this.pendingInsert !== undefined) {
      const err = uniqueError(this.pendingInsert)
      if (err) return { data: null, error: err }
      const defaults = COLUMN_DEFAULTS[this.table] ?? {}
      const row = { id: randomUUID(), ...defaults, ...this.pendingInsert }
      table.push(row)
      return this.finishSelect([row])
    }

    if (this.op === 'select') {
      // update(...).eq(...).select(...) zinciri: önce yamayı uygula.
      if (this.patch) {
        for (const row of filtered) {
          const err = uniqueError(this.patch, row.id)
          if (err) return { data: null, error: err }
        }
        for (const row of filtered) Object.assign(row, this.patch)
      }
      return this.finishSelect(filtered)
    }

    if (this.op === 'insert') {
      const err = uniqueError(this.pendingInsert)
      if (err) return { data: null, error: err }
      const defaults = COLUMN_DEFAULTS[this.table] ?? {}
      const row = { id: randomUUID(), ...defaults, ...this.pendingInsert }
      table.push(row)
      if (this.mode) return { data: clone(row), error: null }
      return { data: null, error: null }
    }

    if (this.op === 'upsert') {
      const keys = this.conflict ? this.conflict.split(',').map(s => s.trim()) : ['id']
      for (const incoming of this.rows) {
        const existing = table.find(row => keys.every(k => row[k] === incoming[k]))
        const err = uniqueError(incoming, existing?.id)
        if (err) return { data: null, error: err }
        if (existing) Object.assign(existing, incoming)
        else table.push({ id: randomUUID(), ...incoming })
      }
      return { data: null, error: null }
    }

    if (this.op === 'update') {
      for (const row of filtered) {
        const err = uniqueError(this.patch, row.id)
        if (err) return { data: null, error: err }
      }
      for (const row of filtered) Object.assign(row, this.patch)
      return { data: null, error: null }
    }

    if (this.op === 'delete') {
      const doomed = new Set(filtered)
      this.store[this.table] = table.filter(row => !doomed.has(row))
      return { data: null, error: null }
    }

    return { data: null, error: null }
  }

  finishSelect(source) {
    let rows = source.map(clone)
    if (this.orderSpec) {
      const { col, asc } = this.orderSpec
      rows.sort((a, b) => String(a[col]).localeCompare(String(b[col]), 'tr') * (asc ? 1 : -1))
    }
    if (this.selectOpts?.head) return { data: null, count: source.length, error: null }
    if (this.mode === 'single') {
      if (rows.length !== 1) {
        return {
          data: null,
          error: {
            code: 'PGRST116',
            message: `JSON object requested, multiple (or no) rows returned (${rows.length})`,
            details: `Results contain ${rows.length} rows`,
          },
        }
      }
      return { data: rows[0], error: null }
    }
    if (this.mode === 'maybeSingle') return { data: rows[0] ?? null, error: null }
    return { data: rows, error: null }
  }
}

// Tablo sütun varsayılanları (supabase/schema.sql ile uyumlu): insert/upsert
// eğer alanı getirmediyse DB'in dolduracağı değeri uygula.
const COLUMN_DEFAULTS = {
  players: { is_active: true },
}

export function createMemorySupabase(seed = {}, opts = {}) {
  const store = {
    players: clone(seed.players ?? []),
    matches: clone(seed.matches ?? []),
    predictions: clone(seed.predictions ?? []),
    app_config: clone(seed.app_config ?? [
      { key: 'scoring', value: { label: 'Doğru sonuç 1 puan', status: 'provisional', correctOutcome: 1 } },
    ]),
    sync_state: clone(seed.sync_state ?? [
      { id: 1, last_attempt_at: null, last_success_at: null, last_error: null, matches_seen: 0, updated_at: null },
    ]),
  }

  const enforceNameUnique = opts.enforcePlayerNameUnique !== false
  const hooks = {
    unique: (table, incoming, excludeId) => {
      if (!enforceNameUnique || table !== 'players' || incoming?.name == null) return null
      const target = String(incoming.name).toLowerCase()
      const hit = store.players.find(
        p => p.id !== excludeId && String(p.name).toLowerCase() === target,
      )
      return hit
        ? { code: '23505', message: 'duplicate key value violates unique constraint "players_lower_name_key"' }
        : null
    },
  }

  return { store, from: table => new Query(store, table, hooks) }
}

// --- global.fetch stub (offline, deterministik) ---

/**
 * routes: [needle, sonuç][] — URL needle içeriyorsa sonuç uygulanır.
 * sonuç: JSON nesnesi (200) veya Error (reject — yeniden denemesiz).
 * Eşleşmeyen URL'ler defaultJson alır (varsayılan { events: [] }).
 */
export function withStubbedFetch(routes = [], { defaultJson = { events: [] } } = {}) {
  const calls = []
  const original = globalThis.fetch
  const respond = value => {
    if (value instanceof Error) throw value
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  globalThis.fetch = async url => {
    const u = String(url)
    calls.push(u)
    for (const [needle, value] of routes) {
      if (u.includes(needle)) return respond(value)
    }
    return respond(defaultJson)
  }
  return {
    calls,
    restore() {
      globalThis.fetch = original
    },
  }
}

// --- ESPN scoreboard event fikstürü ---

/**
 * espn.js'in okuduğu alanların hepsini üretir.
 * score: sayı | string | { displayValue, value } | null
 */
export function espnEvent(overrides = {}) {
  const {
    id,
    date,
    seasonYear,
    week = 1,
    statusName = 'STATUS_SCHEDULED',
    state = 'pre',
    clock = '',
    timeValid = true,
    home = {},
    away = {},
  } = overrides
  const competitor = (side, def) => ({
    homeAway: side,
    team: {
      displayName: def.displayName ?? def.name ?? 'Takım',
      shortDisplayName: def.shortDisplayName ?? def.short ?? def.displayName ?? def.name ?? 'Takım',
      abbreviation: def.tla ?? null,
      logo: def.crest ?? null,
    },
    score: def.score,
  })
  return {
    id: String(id),
    date,
    season: { year: seasonYear, slug: `${seasonYear}-${seasonYear + 1}` },
    week: { number: week },
    status: { type: { name: statusName, state }, displayClock: clock },
    competitions: [
      {
        timeValid,
        competitors: [competitor('home', home), competitor('away', away)],
      },
    ],
  }
}

// --- Küçük yardımcılar ---

export const jsonBody = response => response.json()

export const projectRoot = fileURLToPath(new URL('../..', import.meta.url))
