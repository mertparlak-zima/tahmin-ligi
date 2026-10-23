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
  return { from: table => new Query(store, table) }
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
    const started = Date.now()
    syncing = (syncing ?? Promise.resolve())
      .then(() => maybeSync(supabase))
      .catch(() => {})
    await syncing
    const payload = await buildLeaguePayload(supabase)
    console.log(`GET /api/league → ${payload.meta.counts.matches} maç (${Date.now() - started} ms)`)
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
      return admin.bootstrap(supabase)
    case 'PUT /api/admin/predictions':
      return admin.savePredictions(supabase, webReq)
    case 'POST /api/admin/players':
      return admin.createPlayer(supabase, webReq)
    case 'PATCH /api/admin/players':
      return admin.updatePlayer(supabase, webReq)
    case 'PUT /api/admin/scoring':
      return admin.saveScoring(supabase, webReq)
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
  console.log(`  Maç verisi   : gerçek ESPN · açılışta çekiliyor (~2-4 sn)`)
  // Açılışta ısıtma: ilk /api/league isteği beklemeden fikstürü çek.
  syncing = maybeSync(supabase).catch(err => console.error('açılış senkronu hatası:', err.message))
})
