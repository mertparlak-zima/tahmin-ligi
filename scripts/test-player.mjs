// Geçici aktif test oyuncusu yönetimi (API üzerinden; şifre yazdırılmaz).
// Kullanım: node --env-file=.env scripts/test-player.mjs create|passive|list
import { setTimeout as sleep } from 'node:timers/promises'

const BASE = process.env.BROWSER_CHECK_URL || 'http://localhost:8787'
const PASSWORD = process.env.ADMIN_PASSWORD
const NAME = 'Test Aktif'
const cmd = process.argv[2] ?? 'list'

if (!PASSWORD) {
  console.error('ADMIN_PASSWORD yok')
  process.exit(1)
}

const api = async (path, options = {}) => {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${PASSWORD}`,
      ...(options.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

const listPlayers = async () => {
  const r = await api('/api/admin/bootstrap')
  return r.body?.players ?? []
}

if (cmd === 'create') {
  const existing = await listPlayers()
  const found = existing.find(p => p.name === NAME)
  if (found) {
    if (found.isActive) {
      console.log('zaten aktif:', found.id, found.name)
      process.exit(0)
    }
    const r = await api('/api/admin/players', { method: 'PATCH', body: JSON.stringify({ id: found.id, isActive: true }) })
    console.log('aktifleştirildi:', r.status, found.id)
    process.exit(0)
  }
  const r = await api('/api/admin/players', { method: 'POST', body: JSON.stringify({ name: NAME, color: '#b8f34a' }) })
  console.log('oluşturuldu:', r.status, r.body?.player?.id ?? r.body?.id ?? '')
  process.exit(r.ok ? 0 : 1)
}

if (cmd === 'passive') {
  const targets = (await listPlayers()).filter(p => p.name === NAME)
  for (const p of targets) {
    if (!p.isActive) continue
    const r = await api('/api/admin/players', { method: 'PATCH', body: JSON.stringify({ id: p.id, isActive: false }) })
    console.log('pasife alındı:', r.status, p.id)
    await sleep(300)
  }
  if (!targets.length) console.log('bulunamadı')
  process.exit(0)
}

const r = await api('/api/admin/bootstrap')
console.log(JSON.stringify((r.body?.players ?? []).map(p => ({ id: p.id, name: p.name, isActive: p.isActive })), null, 1))
