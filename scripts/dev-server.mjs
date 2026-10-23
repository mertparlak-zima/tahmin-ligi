// Gerçek Supabase'e bağlanan lokal tam-yığın sunucu.
// dist/ dosyalarını + gerçek API handler'larını servis eder.
//
//   1) .env dosyasına SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ADMIN_PASSWORD yaz
//   2) npm run build
//   3) npm run dev:db
//
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import leagueHandler from '../api/league.js'
import adminHandler from '../api/admin.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, '..', 'dist')
const PORT = Number(process.env.PORT || 8787)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
}

async function readBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf-8')
  return raw || undefined
}

async function serveStatic(pathname) {
  if (!existsSync(DIST)) return null
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1)
  const file = path.join(DIST, relative)
  if (existsSync(file) && !path.relative(DIST, file).startsWith('..')) {
    return { body: await readFile(file), type: MIME[path.extname(file)] ?? 'application/octet-stream' }
  }
  const index = path.join(DIST, 'index.html')
  if (existsSync(index)) return { body: await readFile(index), type: MIME['.html'] }
  return null
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  try {
    if (url.pathname.startsWith('/api/')) {
      const body = await readBody(req)
      const webReq = new Request(`http://localhost:${PORT}${url.pathname}${url.search}`, {
        method: req.method,
        headers: req.headers,
        body,
      })
      const handler = url.pathname.startsWith('/api/admin') ? adminHandler : leagueHandler
      const response = await handler(webReq)
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(await response.text())
      return
    }
    const file = await serveStatic(url.pathname)
    if (file) {
      res.writeHead(200, { 'content-type': file.type, 'cache-control': 'no-store' })
      res.end(file.body)
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('dist/ bulunamadı — önce `npm run build` çalıştır.')
  } catch (err) {
    console.error('hata:', err.message)
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: err.message }))
  }
})

server.listen(PORT, () => {
  console.log('Tahmin Ligi — lokal sunucu (gerçek Supabase)')
  console.log(`  Adres   : http://localhost:${PORT}`)
  console.log(`  Yönetim : http://localhost:${PORT}/admin`)
  console.log(`  Not     : şifre .env içindeki ADMIN_PASSWORD`)
})
