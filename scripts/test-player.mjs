// Geçici test oyuncusu yönetimi (public API üzerinden; #24 Faz 1 — şifre yok).
// Kullanım: node --env-file=.env scripts/test-player.mjs create|passive|list
// Not: oyuncu listesi public /api/league payload'ından gelir (yalnız AKTİF
// oyuncular). Pasif kalan "Test Aktif" public listede görünmez; create yine
// benzersizlik hatası verir — o durumda list/db'den elle bakın.

const BASE = process.env.BROWSER_CHECK_URL || 'http://localhost:8787'
const NAME = 'Test Aktif'
const cmd = process.argv[2] ?? 'list'

const api = async (path, options = {}) => {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

const listPlayers = async () => {
  const r = await api('/api/league')
  return r.body?.players ?? []
}

if (cmd === 'create') {
  const existing = await listPlayers()
  const found = existing.find(p => p.name === NAME)
  if (found) {
    console.log('zaten aktif listede:', found.id, found.name)
    process.exit(0)
  }
  const r = await api('/api/players', { method: 'POST', body: JSON.stringify({ name: NAME, color: '#b8f34a' }) })
  console.log('oluşturuldu:', r.status, r.body?.player?.id ?? r.body?.error ?? '')
  process.exit(r.ok ? 0 : 1)
}

if (cmd === 'passive') {
  const targets = (await listPlayers()).filter(p => p.name === NAME)
  if (!targets.length) console.log('bulunamadı (aktif listede yok)')
  for (const p of targets) {
    const r = await api('/api/players', { method: 'PATCH', body: JSON.stringify({ id: p.id, isActive: false }) })
    console.log('pasife alındı:', r.status, p.id)
  }
  process.exit(0)
}

const r = await api('/api/league')
console.log(JSON.stringify((r.body?.players ?? []).map(p => ({ id: p.id, name: p.name })), null, 1))
