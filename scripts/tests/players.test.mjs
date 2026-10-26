// D2 · api/players.js (+ api/players/avatar.js) uç testleri — süreç içi
// Request nesneleri + memory supabase (request.supabase enjeksiyonu).
// #24 Faz 1: oyuncu yönetimi ve avatar yüklemesi herkese açık.

import assert from 'node:assert/strict'
import { POST, PATCH, DELETE } from '../../api/players.js'
import { POST as avatarPOST, DELETE as avatarDELETE } from '../../api/players/avatar.js'
import { createMemorySupabase, createSuite, hour, iso, runIfMain } from './helpers.mjs'

const suite = createSuite('D2 · api/players.js + avatar')

// Named method export'lar doğrudan çağrılır; supabase isteğe enjekte edilir.
const call = (sup, handler, method, body, url = 'http://localhost:8787/api/players') => {
  const req = new Request(url, {
    method,
    body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(body ?? {}),
    headers: { 'content-type': 'application/json' },
  })
  req.supabase = sup
  return handler(req)
}

const basePlayers = () => [
  { id: 'p1', name: 'Ogün', color: '#b8f34a', is_active: true },
  { id: 'p2', name: 'Mert', color: '#5ce1e6', is_active: true },
]

// --- createPlayer (POST) ---

suite.test('oyuncu ekleme: 201 + isim kırpma + palet rengi + public', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: [] })
  // Authorization başlığı YOK — uç herkese açık (#24).
  const res = await call(sup, POST, 'POST', { name: '  Zeynep   Can ' })
  assert.equal(res.status, 201)
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.equal(body.player.name, 'Zeynep Can')
  assert.equal(body.player.color, '#ff9f68', 'iki oyuncu var → palet[2]')
  assert.equal(body.player.is_active, true, 'DB varsayılanı: aktif')
  assert.equal(body.player.initials, 'ZC')
  assert.equal(sup.store.players.length, 3)
})

suite.test('oyuncu ekleme: geçersiz renk paletten düşer, geçerli renk kullanılır', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: [] })
  const bad = await call(sup, POST, 'POST', { name: 'Renksiz', color: 'purple' })
  assert.equal(bad.status, 201)
  assert.equal((await bad.json()).player.color, '#ff9f68', 'geçersiz renk → palet')

  const good = await call(sup, POST, 'POST', { name: 'Renkli', color: '#123ABC' })
  assert.equal(good.status, 201)
  assert.equal((await good.json()).player.color, '#123ABC')
})

suite.test('oyuncu ekleme: kısa/boş isim 400; 41 karakter 400', async () => {
  const sup = createMemorySupabase({ players: [], matches: [] })
  for (const name of ['A', '', '   ', 'x'.repeat(41)]) {
    const res = await call(sup, POST, 'POST', { name })
    assert.equal(res.status, 400, `isim=${JSON.stringify(name).slice(0, 12)} → 400`)
    assert.equal((await res.json()).error, 'İsim 2-40 karakter olmalı.')
  }
  assert.equal(sup.store.players.length, 0)
})

suite.test('oyuncu ekleme: büyük/küçük harf duyarsız aynı isim → 23505 → 400', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: [] })
  const res = await call(sup, POST, 'POST', { name: 'OGÜN' })
  assert.equal(res.status, 400, 'unique ihlali dostça 400 olmalı')
  assert.equal((await res.json()).error, 'Bu isimde bir oyuncu zaten var.')
  assert.equal(sup.store.players.length, 2, 'yeni satır eklenmedi')
})

// --- updatePlayer (PATCH) ---

suite.test('oyuncu güncelleme: isim/renk/aktiflik yamaları', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: [] })

  const rename = await call(sup, PATCH, 'PATCH', { id: 'p1', name: 'Ogün Can' })
  assert.equal(rename.status, 200)
  const renamed = await rename.json()
  assert.equal(renamed.player.name, 'Ogün Can')
  assert.equal(renamed.player.initials, 'OC')
  assert.equal(sup.store.players.find(p => p.id === 'p1').name, 'Ogün Can')

  const recolor = await call(sup, PATCH, 'PATCH', { id: 'p1', color: '#abcdef' })
  assert.equal(recolor.status, 200)
  assert.equal((await recolor.json()).player.color, '#abcdef')

  const deactivate = await call(sup, PATCH, 'PATCH', { id: 'p2', isActive: false })
  assert.equal(deactivate.status, 200)
  assert.equal((await deactivate.json()).player.is_active, false)
  assert.equal(sup.store.players.find(p => p.id === 'p2').is_active, false)
})

suite.test('oyuncu güncelleme: geçersiz alanlar 400, boş yama 400', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: [] })
  const cases = [
    [{ id: 'p1', name: 'x' }, 'İsim 2-40 karakter olmalı.'],
    [{ id: 'p1', color: 'nope' }, 'Renk #rrggbb biçiminde olmalı.'],
    [{ id: 'p1' }, 'Güncellenecek alan yok.'],
    [{ name: 'Yeni' }, 'id gerekli.'],
  ]
  for (const [body, message] of cases) {
    const res = await call(sup, PATCH, 'PATCH', body)
    assert.equal(res.status, 400, `400 bekleniyordu: ${JSON.stringify(body)}`)
    assert.equal((await res.json()).error, message)
  }
})

suite.test('oyuncu güncelleme: bilinmeyen oyuncu 404 (gerçek supabase PGRST116 yolu)', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: [] })
  const res = await call(sup, PATCH, 'PATCH', { id: 'hayalet', name: 'Yeni İsim' })
  assert.equal(res.status, 404, 'bilinmeyen id dostça 404 olmalı (500 değil)')
  assert.equal((await res.json()).error, 'Oyuncu bulunamadı.')
})

suite.test('oyuncu güncelleme: başka oyuncunun ismi (case-insensitive) → 23505 → 400', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: [] })
  const res = await call(sup, PATCH, 'PATCH', { id: 'p1', name: 'mert' })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'Bu isimde bir oyuncu zaten var.')
  assert.equal(sup.store.players.find(p => p.id === 'p1').name, 'Ogün', 'isim değişmedi')
})

// --- deletePlayer (DELETE) ---

suite.test('oyuncu silme: tahmini varsa 409 reddeder', async () => {
  const sup = createMemorySupabase({
    players: basePlayers(),
    matches: [],
    predictions: [
      { player_id: 'p1', match_id: 'm-open', outcome: 'H', updated_at: iso(Date.now()) },
    ],
  })
  const res = await call(sup, DELETE, 'DELETE', { id: 'p1' })
  assert.equal(res.status, 409)
  assert.equal((await res.json()).error, 'Oyuncunun 1 tahmini var; önce tahminleri silin.')
  assert.equal(sup.store.players.length, 2, 'oyuncu duruyor')
})

suite.test('oyuncu silme: tahmini yoksa siler; id yoksa 400', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: [] })
  const missing = await call(sup, DELETE, 'DELETE', {})
  assert.equal(missing.status, 400)
  assert.equal((await missing.json()).error, 'id gerekli.')

  const res = await call(sup, DELETE, 'DELETE', { id: 'p2' })
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()), { ok: true, deleted: 'p2' })
  assert.deepEqual(sup.store.players.map(p => p.id), ['p1'])
})

// --- avatar uçları (#17 → #24 public) ---

// Magic-byte önekli minimal test görselleri (gerçek decode gerekmez).
// RIFF_BYTES: WebP = RIFF magic + 8. bayttan 'WEBP' etiketi (#24 T3 review
// ile sniff bunu da doğruluyor).
const b64 = bytes => Buffer.from(bytes).toString('base64')
const JPEG_BYTES = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]
const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]
const RIFF_BYTES = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]
const dataUrl = (mime, bytes) => `data:${mime};base64,${b64(bytes)}`
const avatarUrl = 'http://localhost:8787/api/players/avatar'

suite.test('avatar yükleme: mutlu yol — 200, storage dolu, players.avatar_url güncel', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const res = await call(sup, avatarPOST, 'POST', { playerId: 'p1', dataUrl: dataUrl('image/jpeg', JPEG_BYTES) }, avatarUrl)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.ok(body.avatarUrl.startsWith('http://memory.local/storage/avatars/av-p1-'), 'public URL dönüyor')
  assert.ok(body.avatarUrl.endsWith('.jpg'), 'uzantı magic-byte türünden (jpeg → jpg)')
  assert.equal(body.player.id, 'p1')
  assert.equal(body.player.name, 'Ogün')
  assert.equal(body.player.initials, 'O')
  assert.equal(body.player.avatar_url, body.avatarUrl, 'yanıt satırdaki güncel URL ile aynı')
  // storage'da dosya var
  const paths = Object.keys(sup.store.storage.avatars ?? {})
  assert.equal(paths.length, 1)
  assert.ok(paths[0].startsWith('av-p1-'))
  assert.ok(paths[0].endsWith('.jpg'))
  // DB satırı güncellendi
  assert.equal(sup.store.players.find(p => p.id === 'p1').avatar_url, body.avatarUrl)
})

suite.test('avatar yükleme: ikinci yükleme YENİ ad alır, eski dosya silinir', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const first = await call(sup, avatarPOST, 'POST', { playerId: 'p1', dataUrl: dataUrl('image/jpeg', JPEG_BYTES) }, avatarUrl)
  assert.equal(first.status, 200)
  const url1 = (await first.json()).avatarUrl
  // versiyonlu ad Date.now() içerdiği için benzersizliği garantiye al
  await new Promise(r => setTimeout(r, 5))
  const second = await call(sup, avatarPOST, 'POST', { playerId: 'p1', dataUrl: dataUrl('image/jpeg', JPEG_BYTES) }, avatarUrl)
  assert.equal(second.status, 200)
  const url2 = (await second.json()).avatarUrl

  assert.notEqual(url1, url2, 'versiyonlu ad → cache-busting')
  const paths = Object.keys(sup.store.storage.avatars ?? {})
  assert.equal(paths.length, 1, 'eski dosya temizlendi')
  assert.ok(paths[0].startsWith('av-p1-'))
  assert.equal(`http://memory.local/storage/avatars/${paths[0]}`, url2, 'kalan dosya yeni yükleme')
  assert.equal(sup.store.players.find(p => p.id === 'p1').avatar_url, url2)
})

suite.test('avatar yükleme: magic-byte beyanla uyuşmaz ama whitelist türü → kabul, uzantı içerikten', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  // beyan PNG, içerik JPEG → belirleyici olan içerik: kabul + .jpg
  const res = await call(sup, avatarPOST, 'POST', { playerId: 'p1', dataUrl: dataUrl('image/png', JPEG_BYTES) }, avatarUrl)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.ok(body.avatarUrl.endsWith('.jpg'))
  // beyan JPEG, içerik WebP (RIFF+WEBP) → kabul + .webp
  const res2 = await call(sup, avatarPOST, 'POST', { playerId: 'p2', dataUrl: dataUrl('image/jpeg', RIFF_BYTES) }, avatarUrl)
  assert.equal(res2.status, 200)
  assert.ok((await res2.json()).avatarUrl.endsWith('.webp'))
})

suite.test('avatar yükleme (#24 review): WEBP etiketi olmayan RIFF (WAV/AVI) reddedilir', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  // RIFF magic'i taşıyan ama 8. baytta WEBP etiketi OLMAYAN gövde (WAV benzeri)
  const fakeRiff = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45])
  const res = await call(sup, avatarPOST, 'POST', { playerId: 'p1', dataUrl: dataUrl('image/webp', fakeRiff) }, avatarUrl)
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'Dosya içeriği geçerli bir görsel değil (JPEG, PNG, WebP).')
})

suite.test('players (#24 review): uuid olmayan id → 400 (PostgREST 22P02 sızması yok)', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const bad = "'; drop table players; --"
  const patch = await call(sup, PATCH, 'PATCH', { id: bad, color: '#ffffff' })
  assert.equal(patch.status, 400)
  const del = await call(sup, DELETE, 'DELETE', { id: bad })
  assert.equal(del.status, 400)
  const av = await call(sup, avatarPOST, 'POST', { playerId: bad, dataUrl: dataUrl('image/jpeg', JPEG_BYTES) }, avatarUrl)
  assert.equal(av.status, 400)
})

suite.test('avatar yükleme: geçersiz MIME beyanı 400', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  // data:image/* önekli ama beyaz liste dışı beyanlar
  for (const mime of ['image/gif', 'image/bmp', 'image/svg+xml']) {
    const res = await call(sup, avatarPOST, 'POST', { playerId: 'p1', dataUrl: dataUrl(mime, JPEG_BYTES) }, avatarUrl)
    assert.equal(res.status, 400, `mime=${mime} → 400`)
    assert.equal((await res.json()).error, 'Görsel türü JPEG, PNG veya WebP olmalı.')
  }
})

suite.test('avatar yükleme: 512 KB üzeri gövde 400', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const big = Buffer.alloc(512 * 1024 + 1)
  big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff // geçerli JPEG öneki, ama boyut sınırı aşılır
  const res = await call(sup, avatarPOST, 'POST', { playerId: 'p1', dataUrl: dataUrl('image/jpeg', big) }, avatarUrl)
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'Görsel en fazla 512 KB olabilir.')
  assert.equal(Object.keys(sup.store.storage.avatars ?? {}).length, 0, 'hiçbir şey yüklenmez')
  assert.equal(sup.store.players.find(p => p.id === 'p1').avatar_url, undefined, 'satır dokunulmaz')
})

suite.test('avatar yükleme: magic-byte uyuşmayan içerik 400 (beyan geçerli olsa bile)', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const junk = [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]
  const res = await call(sup, avatarPOST, 'POST', { playerId: 'p1', dataUrl: dataUrl('image/jpeg', junk) }, avatarUrl)
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'Dosya içeriği geçerli bir görsel değil (JPEG, PNG, WebP).')
  assert.equal(Object.keys(sup.store.storage.avatars ?? {}).length, 0)
})

suite.test('avatar yükleme: bozuk dataUrl ve eksik playerId 400', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const cases = [
    { playerId: 'p1' }, // dataUrl yok
    { playerId: 'p1', dataUrl: 42 }, // string değil
    { playerId: 'p1', dataUrl: 'http://ornek.com/a.jpg' }, // data: öneki yok
    { playerId: 'p1', dataUrl: 'data:text/plain;base64,aGk=' }, // görsel değil
    { playerId: 'p1', dataUrl: 'data:video/mp4;base64,AAAA' }, // data:image/ öneki yok
    { playerId: 'p1', dataUrl: 'data:image/jpeg;base64' }, // virgül yok
    { playerId: 'p1', dataUrl: 'data:image/jpeg,abcd' }, // base64 işaretçisi yok
    { dataUrl: dataUrl('image/jpeg', JPEG_BYTES) }, // playerId yok
  ]
  for (const body of cases) {
    const res = await call(sup, avatarPOST, 'POST', body, avatarUrl)
    assert.equal(res.status, 400, `400 bekleniyordu: ${JSON.stringify(body).slice(0, 60)}`)
  }
  assert.equal(Object.keys(sup.store.storage.avatars ?? {}).length, 0)
  assert.equal(sup.store.players.find(p => p.id === 'p1').avatar_url, undefined)
})

suite.test('avatar yükleme: bilinmeyen oyuncu 404', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const res = await call(sup, avatarPOST, 'POST', { playerId: 'hayalet', dataUrl: dataUrl('image/jpeg', JPEG_BYTES) }, avatarUrl)
  assert.equal(res.status, 404)
  assert.equal((await res.json()).error, 'Oyuncu bulunamadı.')
  assert.equal(Object.keys(sup.store.storage.avatars ?? {}).length, 0, '404 yolunda yükleme yapılmaz')
})

suite.test('avatar yükleme: av- önekine uymayan eski URL dokunulmaz (güvenlik gardiyanı)', async () => {
  const sup = createMemorySupabase({
    players: [
      { ...basePlayers()[0], avatar_url: 'http://memory.local/storage/avatars/manual-set.jpg' },
    ],
    storage: { avatars: { 'manual-set.jpg': Buffer.from([1, 2, 3]) } },
  })
  const res = await call(sup, avatarPOST, 'POST', { playerId: 'p1', dataUrl: dataUrl('image/jpeg', JPEG_BYTES) }, avatarUrl)
  assert.equal(res.status, 200)
  const paths = Object.keys(sup.store.storage.avatars ?? {})
  assert.equal(paths.length, 2, 'yeni dosya + dokunulmamış yabancı dosya')
  assert.ok(paths.includes('manual-set.jpg'), 'başka oyuncuya/dosyaya ait path asla silinmez')
})

suite.test('avatar silme: dosyayı siler, avatar_url null olur', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const up = await call(sup, avatarPOST, 'POST', { playerId: 'p1', dataUrl: dataUrl('image/jpeg', JPEG_BYTES) }, avatarUrl)
  assert.equal(up.status, 200)
  const path1 = Object.keys(sup.store.storage.avatars ?? {})[0]

  const res = await call(sup, avatarDELETE, 'DELETE', { playerId: 'p1' }, avatarUrl)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.equal(body.player.id, 'p1')
  assert.equal(body.player.avatar_url, null)
  assert.equal(body.player.initials, 'O')
  assert.equal(Object.keys(sup.store.storage.avatars ?? {}).length, 0, 'dosya storage\'dan silindi')
  assert.ok(!(path1 in (sup.store.storage.avatars ?? {})))
  assert.equal(sup.store.players.find(p => p.id === 'p1').avatar_url, null)
})

suite.test('avatar silme: avataru olmayan oyuncu → 200, null kalır', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const res = await call(sup, avatarDELETE, 'DELETE', { playerId: 'p2' }, avatarUrl)
  assert.equal(res.status, 200)
  assert.equal((await res.json()).player.avatar_url, null)
})

suite.test('avatar silme: playerId yoksa 400, oyuncu yoksa 404', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const missing = await call(sup, avatarDELETE, 'DELETE', {}, avatarUrl)
  assert.equal(missing.status, 400)
  assert.equal((await missing.json()).error, 'playerId gerekli.')

  const ghost = await call(sup, avatarDELETE, 'DELETE', { playerId: 'hayalet' }, avatarUrl)
  assert.equal(ghost.status, 404)
  assert.equal((await ghost.json()).error, 'Oyuncu bulunamadı.')
})

suite.test('avatar silme: playerId query string\'den de okunur', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const req = new Request(`${avatarUrl}?playerId=p1`, { method: 'DELETE' })
  req.supabase = sup
  const res = await avatarDELETE(req)
  assert.equal(res.status, 200)
  assert.equal((await res.json()).ok, true)
})

await runIfMain(suite)
export { suite }
