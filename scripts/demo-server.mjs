// Lokal demo sunucusu: gerçek ESPN verisi + in-memory "Supabase".
// Veritabanı gerektirmez; her yeniden başlatmada sıfırlanır.
//
//   npm run demo        → derler + http://localhost:8787 üzerinde tam yığın
//   npm run dev:api     → yalnız API (vite dev proxy'si ile birlikte)
//
// Yönetim şifresi: ADMIN_PASSWORD env'i ya da varsayılan "demo123".

import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

import { maybeSync } from '../lib/sync.js'
import { buildLeaguePayload } from '../lib/league.js'
import { seasonYear } from '../lib/espn.js'
import { GET as leagueGET } from '../api/league.js'
import * as admin from '../api/admin.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, '..', 'dist')
const PORT = Number(process.env.PORT || 8787)

if (!process.env.ADMIN_PASSWORD) process.env.ADMIN_PASSWORD = 'demo123'

// ----------------------------------------------------------------------
// In-memory supabase-js adaptörü (yalnızca projenin kullandığı alt küme)
// ----------------------------------------------------------------------

const clone = v => structuredClone(v)

class Query {
  constructor(store, table) {
    this.store = store
    this.table = table
    this.op = 'select'
    this.filters = []
    this.orderSpec = null
    this.rows = null
    this.row = null
    this.patch = null
    this.conflict = null
    this.selectOpts = null
    this.inserted = null
    this.mode = null // maybeSingle | single
  }

  select(cols, opts) {
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

    if (this.op === 'select') {
      let source
      if (this.pendingInsert !== undefined) {
        // insert().select().single() zinciri: eklenen satırı döndür
        const row = { id: randomUUID(), ...this.pendingInsert }
        table.push(row)
        this.inserted = [row]
        source = [row]
      } else {
        // update().select() zinciri: önce yamayı uygula
        if (this.patch) for (const row of filtered) Object.assign(row, this.patch)
        source = filtered
      }
      let rows = source.map(clone)
      if (this.orderSpec) {
        const { col, asc } = this.orderSpec
        rows.sort((a, b) => String(a[col]).localeCompare(String(b[col]), 'tr') * (asc ? 1 : -1))
      }
      if (this.selectOpts?.head) return { data: null, count: source.length, error: null }
      if (this.mode) return { data: rows[0] ?? null, error: null }
      return { data: rows, error: null }
    }

    if (this.op === 'insert') {
      const row = { id: randomUUID(), ...this.pendingInsert }
      table.push(row)
      this.inserted = [row]
      if (this.mode) return { data: clone(row), error: null }
      return { data: null, error: null }
    }

    if (this.op === 'upsert') {
      const keys = this.conflict ? this.conflict.split(',').map(s => s.trim()) : ['id']
      for (const incoming of this.rows) {
        const existing = table.find(row => keys.every(k => row[k] === incoming[k]))
        if (existing) Object.assign(existing, incoming)
        else table.push({ id: randomUUID(), ...incoming })
      }
      return { data: null, error: null }
    }

    if (this.op === 'update') {
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
}

function createMemorySupabase() {
  const store = {
    players: [
      { id: randomUUID(), name: 'Ogün', color: '#b8f34a', is_active: true, created_at: new Date().toISOString() },
      { id: randomUUID(), name: 'Mert', color: '#5ce1e6', is_active: true, created_at: new Date().toISOString() },
      { id: randomUUID(), name: 'Ece', color: '#ff9f68', is_active: true, created_at: new Date().toISOString() },
    ],
    matches: [],
    predictions: [],
    app_config: [
      { key: 'scoring', value: { label: 'Doğru sonuç 1 puan', status: 'provisional', correctOutcome: 1 } },
    ],
    sync_state: [
      { id: 1, last_attempt_at: null, last_success_at: null, last_error: null, matches_seen: 0, updated_at: null },
    ],
  }
  // Storage stub (#17): avatar uçları bellek-içi demo'da da gerçek yoldan geçsin.
  store.storage = {}
  const storageApi = bucket => ({
    async upload(path, bytes) {
      store.storage[bucket] ??= {}
      if (store.storage[bucket][path] !== undefined) {
        throw new Error('demo-storage: aynı path zaten var: ' + path)
      }
      store.storage[bucket][path] = bytes
      return { data: { path }, error: null }
    },
    async remove(paths) {
      store.storage[bucket] ??= {}
      for (const p of paths ?? []) delete store.storage[bucket][p]
      return { data: [], error: null }
    },
    getPublicUrl(path) {
      return { data: { publicUrl: `http://memory.local/storage/${bucket}/${path}` } }
    },
  })
  return { from: table => new Query(store, table), storage: { from: storageApi } }
}

// ----------------------------------------------------------------------
// #21 TSL demo tohumu: gerçek tur.1 senkronunun yanına birkaç garantili
// Süper Lig maçı (Samsunspor/Başakşehir/Konyaspor dahil) + tahmin ekler —
// UI fazında lig değiştirme tarayıcıda denenir. Bellekte kalır, reset'te
// düşer. Gelecek maçların hepsine tahmin eklenir: tahminli satır sonraki
// TSL senkron turlarında prune edilmez (senkron koruması).
// ----------------------------------------------------------------------

const HOUR_MS = 3600_000

async function seedTslDemo(supabase) {
  const { data: players } = await supabase.from('players').select('*')
  const active = (players ?? []).filter(p => p.is_active)
  if (active.length === 0) return 0

  const now = Date.now()
  const kickoff = ms => new Date(ms).toISOString()
  const base = {
    provider: 'espn',
    competition: 'TSL',
    status: 'TIMED',
    minute: null,
    home_tla: null, away_tla: null, home_crest: null, away_crest: null,
    home_score: null, away_score: null,
    matchday: null, stage: null,
    season_year: seasonYear(),
    league: 'TSL',
  }
  const teams = (home, away, hs, as) => ({
    home_name: home, home_short: home,
    away_name: away, away_short: away,
    home_score: hs, away_score: as,
  })
  const matches = [
    { id: 'demo-tsl-1', ...base, external_id: 'demo-tsl-1', kickoff: kickoff(now - 72 * HOUR_MS), status: 'FINISHED', ...teams('Galatasaray', 'Samsunspor', 3, 1) },
    { id: 'demo-tsl-2', ...base, external_id: 'demo-tsl-2', kickoff: kickoff(now - 48 * HOUR_MS), status: 'FINISHED', ...teams('Konyaspor', 'Trabzonspor', 1, 1) },
    { id: 'demo-tsl-3', ...base, external_id: 'demo-tsl-3', kickoff: kickoff(now - 30 * HOUR_MS), status: 'FINISHED', ...teams('Beşiktaş', 'Başakşehir', 2, 0) },
    { id: 'demo-tsl-4', ...base, external_id: 'demo-tsl-4', kickoff: kickoff(now - 2 * HOUR_MS), status: 'IN_PLAY', minute: 63, ...teams('Fenerbahçe', 'Konyaspor', 1, 0) },
    { id: 'demo-tsl-5', ...base, external_id: 'demo-tsl-5', kickoff: kickoff(now + 26 * HOUR_MS), ...teams('Başakşehir', 'Fenerbahçe', null, null) },
    { id: 'demo-tsl-6', ...base, external_id: 'demo-tsl-6', kickoff: kickoff(now + 50 * HOUR_MS), ...teams('Samsunspor', 'Beşiktaş', null, null) },
    { id: 'demo-tsl-7', ...base, external_id: 'demo-tsl-7', kickoff: kickoff(now + 74 * HOUR_MS), ...teams('Trabzonspor', 'Galatasaray', null, null) },
  ]
  await supabase.from('matches').upsert(matches, { onConflict: 'provider,external_id' })

  // Tahminler: bitmişlerde karışık doğruluk, canlıda bir giriş, geleceklerde
  // her maça en az bir tahmin (prune koruması) — mühür akışı da görünür.
  const [a, b, c] = active
  const predictions = [
    { player_id: a.id, match_id: 'demo-tsl-1', outcome: 'H' }, // doğru (3-1)
    { player_id: b.id, match_id: 'demo-tsl-1', outcome: 'A' }, // yanlış
    { player_id: b.id, match_id: 'demo-tsl-2', outcome: 'D' }, // doğru (1-1)
    { player_id: a.id, match_id: 'demo-tsl-3', outcome: 'H' }, // doğru (2-0)
    { player_id: c?.id ?? a.id, match_id: 'demo-tsl-3', outcome: 'D' }, // yanlış
    { player_id: b.id, match_id: 'demo-tsl-4', outcome: 'H' }, // canlı → açılır, puan null
    { player_id: a.id, match_id: 'demo-tsl-5', outcome: 'H' }, // gelecek → mühürlü
    { player_id: b.id, match_id: 'demo-tsl-6', outcome: 'A' },
    { player_id: c?.id ?? a.id, match_id: 'demo-tsl-7', outcome: 'D' },
    { player_id: a.id, match_id: 'demo-tsl-7', outcome: 'H' },
  ]
  await supabase.from('predictions').upsert(predictions, { onConflict: 'player_id,match_id' })
  return predictions.length
}

// ----------------------------------------------------------------------
// HTTP sunucusu
// ----------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
}

const supabase = createMemorySupabase()
let syncing = null

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf-8')
  return JSON.parse(raw || '{}')
}

function toWebRequest(request, body) {
  const url = `http://localhost:${PORT}${request.url}`
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  return new Request(url, {
    method: request.method,
    headers: request.headers,
    body: hasBody ? JSON.stringify(body ?? {}) : undefined,
  })
}

async function handleApi(request) {
  const pathname = new URL(request.url, `http://localhost:${PORT}`).pathname.replace(/\/+$/, '')
  const method = request.method

  if (method === 'GET' && pathname === '/api/league') {
    // Gerçek uç kodu (#16): api/league.js GET — ETag/304 + ?season/?league
    // doğrulaması dahil. Senkron kuyruğu korunur (admin senkronuyla serileşir).
    const started = Date.now()
    syncing = (syncing ?? Promise.resolve())
      .then(() => maybeSync(supabase))
      .catch(() => {})
    await syncing
    const webReq = new Request(`http://localhost:${PORT}${request.url}`, {
      method: 'GET',
      headers: request.headers,
    })
    webReq.supabase = supabase
    const res = await leagueGET(webReq)
    if (!process.env.DEV_FAKE_STALE || res.status !== 200) {
      console.log(`GET /api/league → ${res.status} (${Date.now() - started} ms)`)
      return res
    }
    // Deterministik bayatlık senaryosu (browser-check için): bant + SON BİLGİ
    // etiketlerini her koşulda tetikler; yalnız demo sunucuda çalışır.
    const payload = await res.json()
    const nowIso = new Date().toISOString()
    payload.meta.sync = {
      lastAttemptAt: nowIso,
      lastSuccessAt: new Date(Date.now() - 4 * 3600_000).toISOString(),
      lastError: 'demo: kaynak zaman aşımı (DEV_FAKE_STALE)',
      matchesSeen: payload.meta.sync?.matchesSeen ?? 0,
      lastSuccessAgeMinutes: 240,
    }
    const target = payload.matches.find(m => !m.isFinished) ?? payload.matches[0]
    if (target) {
      target.isLive = true
      target.isStarted = true
      target.statusGroup = 'live'
      target.minute = 67
      target.predictionsVisible = true
    }
    console.log(`GET /api/league → 200 fake-stale (${Date.now() - started} ms)`)
    return new Response(JSON.stringify(payload), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  }

  const webReq = toWebRequest(request, await readBody(request).catch(() => ({})))
  const route = `${method} ${pathname}`

  switch (route) {
    case 'POST /api/admin/login':
      return admin.login(webReq)
    case 'GET /api/admin/bootstrap':
      // ?league= parametresi uca taşınır (#21); parametresiz → aktif EU.
      return admin.bootstrap(supabase, webReq)
    case 'PUT /api/admin/predictions':
      return admin.savePredictions(supabase, webReq)
    case 'POST /api/admin/players':
      return admin.createPlayer(supabase, webReq)
    case 'PATCH /api/admin/players':
      return admin.updatePlayer(supabase, webReq)
    case 'PUT /api/admin/scoring':
      return admin.saveScoring(supabase, webReq)
    case 'PUT /api/admin/players/avatar':
      return admin.uploadAvatar(supabase, webReq)
    case 'DELETE /api/admin/players/avatar':
      // deleteAvatar gövde VEYA query playerId kabul eder (demo webReq'te ikisi de var).
      return admin.deleteAvatar(supabase, webReq)
    case 'POST /api/admin/sync': {
      // Senkronizasyonları tek sıraya diz; çakışma olmasın.
      syncing = (syncing ?? Promise.resolve()).then(() => admin.sync(supabase))
      return syncing
    }
    default:
      return new Response(JSON.stringify({ error: 'Bilinmeyen uç.' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
  }
}

async function serveStatic(pathname) {
  if (!existsSync(DIST)) return null
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1)
  const file = path.join(DIST, relative)
  if (existsSync(file) && path.relative(DIST, file).startsWith('..') === false) {
    const ext = path.extname(file)
    return { body: await readFile(file), type: MIME[ext] ?? 'application/octet-stream' }
  }
  const index = path.join(DIST, 'index.html')
  if (existsSync(index)) {
    return { body: await readFile(index), type: MIME['.html'] }
  }
  return null
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://localhost:${PORT}`).pathname
  try {
    if (pathname.startsWith('/api/')) {
      const response = await handleApi(req)
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(await response.text())
      return
    }
    const file = await serveStatic(pathname)
    if (file) {
      res.writeHead(200, { 'content-type': file.type, 'cache-control': 'no-store' })
      res.end(file.body)
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('dist/ bulunamadı — önce `npm run build` çalıştır.')
  } catch (err) {
    console.error('hata:', err)
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: err.message }))
  }
})

server.listen(PORT, () => {
  console.log('Tahmin Ligi demo sunucusu')
  console.log(`  Adres        : http://localhost:${PORT}`)
  console.log(`  Yönetim      : http://localhost:${PORT}/admin  (şifre: ${process.env.ADMIN_PASSWORD})`)
  console.log(`  Başlangıç    : 3 demo oyuncu (Ogün, Mert, Ece) · veriler bellekte, reset'te silinir`)
  console.log(`  Maç verisi   : gerçek ESPN · iki lig (EU: UEFA kupaları, TSL: Süper Lig tüm fikstür) · açılışta çekiliyor (~2-4 sn)`)
  // Açılışta ısıtma: ilk /api/league isteği beklemeden fikstürü çek.
  syncing = maybeSync(supabase)
    .catch(err => console.error('açılış senkronu hatası:', err.message))
    .then(async () => {
      // #21: gerçek tur.1 verisinin yanına garantili TSL demo seti.
      const seeded = await seedTslDemo(supabase)
      if (seeded > 0) {
        console.log(`  TSL demo     : 7 Süper Lig maçı + ${seeded} tahmin tohumlandı (?league=TSL ile görünür)`)
      }
      // DEV_FAKE_ARCHIVE=1: geçmiş sezon UI akışını uçtan uca denemek için
      // ilk 8 maçın kopyasını yapma sezonuna (2025) taşır — yalnız bellekte.
      if (!process.env.DEV_FAKE_ARCHIVE) return
      const { data: rows } = await supabase.from('matches').select('*').order('kickoff', { ascending: true })
      const source = (rows ?? []).slice(0, 8)
      if (source.length === 0) return
      const idByOld = new Map()
      const clones = source.map(m => {
        const id = randomUUID()
        idByOld.set(m.id, id)
        return {
          ...m,
          id,
          external_id: `${m.external_id}-s2025`,
          kickoff: new Date(Date.parse(m.kickoff) - 364 * 24 * 3600_000).toISOString(),
          season_year: 2025,
          league: 'EU',
        }
      })
      // Bellek deposunun insert'i tek satır beklediğinden dizi yazımı upsert'le.
      await supabase.from('matches').upsert(clones, { onConflict: 'id' })
      // Demo oyuncular için deterministic tahminler → arşiv puan tablosu dolu olsun.
      const { data: players } = await supabase.from('players').select('*')
      const outcomes = ['H', 'D', 'A']
      const predClones = []
      let i = 0
      for (const m of clones) {
        for (const p of players ?? []) {
          predClones.push({ player_id: p.id, match_id: m.id, outcome: outcomes[(i + p.name.length) % 3] })
          i++
        }
      }
      if (predClones.length > 0) await supabase.from('predictions').upsert(predClones, { onConflict: 'player_id,match_id' })
      console.log(`  Fake arşiv   : 2025 sezonuna ${clones.length} maç + ${predClones.length} tahmin kopyalandı`)
    })
})
