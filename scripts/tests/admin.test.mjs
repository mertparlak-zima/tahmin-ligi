// D · api/admin.js uç testleri — süreç içi Request nesneleri + memory supabase.
// HTTP sunucusu başlatılmaz; export'lanan handler'lar doğrudan çağrılır.

import assert from 'node:assert/strict'
import {
  bootstrap,
  createPlayer,
  deleteAvatar,
  login,
  savePredictions,
  saveScoring,
  sync,
  updatePlayer,
  uploadAvatar,
} from '../../api/admin.js'
import { seasonYear } from '../../lib/espn.js'
import {
  createMemorySupabase,
  createSuite,
  espnEvent,
  hour,
  iso,
  runIfMain,
  withStubbedFetch,
} from './helpers.mjs'

const suite = createSuite('D · api/admin.js')

const req = (body, method = 'PUT') =>
  new Request('http://localhost:8787/api/admin/x', {
    method,
    body: JSON.stringify(body ?? {}),
    headers: { 'content-type': 'application/json' },
  })

const row = o => ({
  provider: 'espn', minute: null,
  home_tla: null, away_tla: null, home_crest: null, away_crest: null,
  matchday: 1, stage: null,
  // Dondurulmuş flag'ler (P5): bootstrap editörü aktif (lig, sezon) filtresi
  // gördüğü için tohumlar aynı kapsamda olmalı.
  league: 'EU',
  season_year: seasonYear(),
  ...o,
})

const basePlayers = () => [
  { id: 'p1', name: 'Ogün', color: '#b8f34a', is_active: true },
  { id: 'p2', name: 'Mert', color: '#5ce1e6', is_active: true },
]

// Maçlar: açık (gelecek TIMED), canlı, bitmiş, gelecekte ertelenen.
const baseMatches = now => [
  row({
    id: 'm-open', external_id: '10', competition: 'CL',
    kickoff: iso(now + 24 * hour), status: 'TIMED',
    home_name: 'Galatasaray', home_short: 'Galatasaray',
    away_name: 'Lyon', away_short: 'Lyon',
    home_score: null, away_score: null,
  }),
  row({
    id: 'm-open2', external_id: '11', competition: 'CL',
    kickoff: iso(now + 48 * hour), status: 'TIMED',
    home_name: 'Fenerbahçe', home_short: 'Fenerbahçe',
    away_name: 'Roma', away_short: 'Roma',
    home_score: null, away_score: null,
  }),
  row({
    id: 'm-live', external_id: '12', competition: 'EL',
    kickoff: iso(now - hour), status: 'IN_PLAY', minute: 30,
    home_name: 'Beşiktaş', home_short: 'Beşiktaş',
    away_name: 'Marseille', away_short: 'Marseille',
    home_score: 0, away_score: 0,
  }),
  row({
    id: 'm-fin', external_id: '13', competition: 'EL',
    kickoff: iso(now - 48 * hour), status: 'FINISHED',
    home_name: 'Trabzonspor', home_short: 'Trabzonspor',
    away_name: 'Rijeka', away_short: 'Rijeka',
    home_score: 2, away_score: 0,
  }),
  row({
    id: 'm-post', external_id: '14', competition: 'CL',
    kickoff: iso(now + 72 * hour), status: 'POSTPONED',
    home_name: 'Galatasaray', home_short: 'Galatasaray',
    away_name: 'Chelsea', away_short: 'Chelsea',
    home_score: null, away_score: null,
  }),
]

// --- login ---

suite.test('login: yanlış şifre 401, doğru şifre 200, bozuk JSON 401', async () => {
  const saved = process.env.ADMIN_PASSWORD
  process.env.ADMIN_PASSWORD = 'test-admin-pw'
  try {
    const bad = await login(req({ password: 'yanlış' }, 'POST'))
    assert.equal(bad.status, 401)
    assert.equal((await bad.json()).error, 'Şifre hatalı.')

    const good = await login(req({ password: 'test-admin-pw' }, 'POST'))
    assert.equal(good.status, 200)
    assert.equal((await good.json()).ok, true)

    const broken = await login(new Request('http://x/api/admin/login', { method: 'POST', body: '{bozuk' }))
    assert.equal(broken.status, 401)
  } finally {
    if (saved === undefined) delete process.env.ADMIN_PASSWORD
    else process.env.ADMIN_PASSWORD = saved
  }
})

// --- bootstrap ---

suite.test('bootstrap: admin payload 200 döner', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: baseMatches(Date.now()) })
  const res = await bootstrap(sup)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.players.length, 2)
  assert.equal(body.matches.length, 5)
  assert.equal(typeof body.predictions, 'object')
})

// --- savePredictions ---

suite.test('savePredictions: mutlu yol kaydeder', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: baseMatches(Date.now()) })
  const res = await savePredictions(sup, req({ playerId: 'p1', items: [{ matchId: 'm-open', outcome: 'H' }] }))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(body, { ok: true, saved: 1, deleted: 0, player: 'Ogün' })
  assert.equal(sup.store.predictions.length, 1)
  assert.equal(sup.store.predictions[0].outcome, 'H')
  assert.equal(sup.store.predictions[0].match_id, 'm-open')
})

suite.test('savePredictions: boş outcome siler, dolu upsert eder', async () => {
  const sup = createMemorySupabase({
    players: basePlayers(),
    matches: baseMatches(Date.now()),
    predictions: [
      { player_id: 'p1', match_id: 'm-open', outcome: 'H', updated_at: iso(Date.now()) },
      { player_id: 'p1', match_id: 'm-open2', outcome: 'D', updated_at: iso(Date.now()) },
    ],
  })
  const res = await savePredictions(sup, req({
    playerId: 'p1',
    items: [{ matchId: 'm-open', outcome: 'A' }, { matchId: 'm-open2', outcome: '' }],
  }))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.saved, 1)
  assert.equal(body.deleted, 1)
  assert.equal(sup.store.predictions.length, 1)
  assert.equal(sup.store.predictions[0].match_id, 'm-open')
  assert.equal(sup.store.predictions[0].outcome, 'A', 'upsert üzerine yazar')
})

suite.test('savePredictions: kilitli maç → 409 VE batch\'in hiçbiri yazılmaz', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: baseMatches(Date.now()) })
  const before = sup.store.predictions.length
  const res = await savePredictions(sup, req({
    playerId: 'p1',
    items: [{ matchId: 'm-open', outcome: 'H' }, { matchId: 'm-live', outcome: 'A' }],
  }))
  assert.equal(res.status, 409)
  assert.equal((await res.json()).error, 'Başlamış veya bitmiş bir maça tahmin kaydedilemez.')
  assert.equal(sup.store.predictions.length, before, 'atomik: açık maç da yazılmadı')

  const resFin = await savePredictions(sup, req({ playerId: 'p1', items: [{ matchId: 'm-fin', outcome: 'H' }] }))
  assert.equal(resFin.status, 409, 'bitmiş maç kilitli')
  const resPost = await savePredictions(sup, req({ playerId: 'p1', items: [{ matchId: 'm-post', outcome: 'H' }] }))
  assert.equal(resPost.status, 409, 'ertelenen maç kilitli')
  assert.equal(sup.store.predictions.length, before)
})

suite.test('savePredictions: geçmiş kickoff\'lu TIMED maç da kilitli', async () => {
  const sup = createMemorySupabase({
    players: basePlayers(),
    matches: [row({
      id: 'm-late', external_id: '20', competition: 'CL',
      kickoff: iso(Date.now() - 5 * 60_000), status: 'TIMED',
      home_name: 'Galatasaray', home_short: 'Galatasaray',
      away_name: 'Lyon', away_short: 'Lyon',
      home_score: null, away_score: null,
    })],
  })
  const res = await savePredictions(sup, req({ playerId: 'p1', items: [{ matchId: 'm-late', outcome: 'H' }] }))
  assert.equal(res.status, 409, 'kickoff geçtiyse edits kilit')
  assert.equal(sup.store.predictions.length, 0)
})

suite.test('savePredictions: geçersiz girişler 400', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: baseMatches(Date.now()) })
  const cases = [
    { playerId: 'p1', items: [{ matchId: 'm-open', outcome: 'X' }] },
    { playerId: 'p1', items: [{ matchId: 'm-open', outcome: 'H' }, { matchId: 'm-open', outcome: 'D' }] },
    { playerId: 'p1', items: [{ outcome: 'H' }] },
    { playerId: 'p1', items: [] },
    { playerId: 'p1' },
    { items: [{ matchId: 'm-open', outcome: 'H' }] },
    { playerId: 'p1', items: Array.from({ length: 101 }, () => ({ matchId: 'm-open', outcome: 'H' })) },
  ]
  for (const body of cases) {
    const res = await savePredictions(sup, req(body))
    assert.equal(res.status, 400, `400 bekleniyordu: ${JSON.stringify(body).slice(0, 60)}`)
  }
  assert.equal(sup.store.predictions.length, 0, 'hiçbir geçersiz istek yazmaz')
})

suite.test('savePredictions: bilinmeyen oyuncu 404, bilinmeyen maç 404', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: baseMatches(Date.now()) })
  const resPlayer = await savePredictions(sup, req({
    playerId: 'yok', items: [{ matchId: 'm-open', outcome: 'H' }],
  }))
  assert.equal(resPlayer.status, 404)
  assert.equal((await resPlayer.json()).error, 'Oyuncu bulunamadı.')

  const resMatch = await savePredictions(sup, req({
    playerId: 'p1', items: [{ matchId: 'hayalet', outcome: 'H' }],
  }))
  assert.equal(resMatch.status, 404)
  assert.equal((await resMatch.json()).error, 'Maç bulunamadı.')
  assert.equal(sup.store.predictions.length, 0)
})

// --- createPlayer ---

suite.test('createPlayer: 201 + isim kırpma + palet rengi', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: [] })
  const res = await createPlayer(sup, req({ name: '  Zeynep   Can ' }, 'POST'))
  assert.equal(res.status, 201)
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.equal(body.player.name, 'Zeynep Can')
  assert.equal(body.player.color, '#ff9f68', 'iki oyuncu var → palet[2]')
  assert.equal(body.player.is_active, true, 'DB varsayılanı: aktif')
  assert.equal(body.player.initials, 'ZC')
  assert.equal(sup.store.players.length, 3)
})

suite.test('createPlayer: geçersiz renk paletten düşer, geçerli renk kullanılır', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: [] })
  const bad = await createPlayer(sup, req({ name: 'Renksiz', color: 'purple' }, 'POST'))
  assert.equal(bad.status, 201)
  assert.equal((await bad.json()).player.color, '#ff9f68', 'geçersiz renk → palet')

  const good = await createPlayer(sup, req({ name: 'Renkli', color: '#123ABC' }, 'POST'))
  assert.equal(good.status, 201)
  assert.equal((await good.json()).player.color, '#123ABC')
})

suite.test('createPlayer: kısa/boş isim 400', async () => {
  const sup = createMemorySupabase({ players: [], matches: [] })
  for (const name of ['A', '', '   ']) {
    const res = await createPlayer(sup, req({ name }, 'POST'))
    assert.equal(res.status, 400, `isim=${JSON.stringify(name)} → 400`)
    assert.equal((await res.json()).error, 'İsim 2-40 karakter olmalı.')
  }
  assert.equal(sup.store.players.length, 0)
})

suite.test('createPlayer: büyük/küçük harf duyarsız aynı isim → 23505 → 400', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: [] })
  const res = await createPlayer(sup, req({ name: 'OGÜN' }, 'POST'))
  assert.equal(res.status, 400, 'unique ihlali dostça 400 olmalı')
  assert.equal((await res.json()).error, 'Bu isimde bir oyuncu zaten var.')
  assert.equal(sup.store.players.length, 2, 'yeni satır eklenmedi')
})

// --- updatePlayer ---

suite.test('updatePlayer: isim/renk/aktiflik yamaları', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: [] })

  const rename = await updatePlayer(sup, req({ id: 'p1', name: 'Ogün Can' }, 'PATCH'))
  assert.equal(rename.status, 200)
  const renamed = await rename.json()
  assert.equal(renamed.player.name, 'Ogün Can')
  assert.equal(renamed.player.initials, 'OC')
  assert.equal(sup.store.players.find(p => p.id === 'p1').name, 'Ogün Can')

  const recolor = await updatePlayer(sup, req({ id: 'p1', color: '#abcdef' }, 'PATCH'))
  assert.equal(recolor.status, 200)
  assert.equal((await recolor.json()).player.color, '#abcdef')

  const deactivate = await updatePlayer(sup, req({ id: 'p2', isActive: false }, 'PATCH'))
  assert.equal(deactivate.status, 200)
  assert.equal((await deactivate.json()).player.is_active, false)
  assert.equal(sup.store.players.find(p => p.id === 'p2').is_active, false)
})

suite.test('updatePlayer: geçersiz alanlar 400, boş yama 400', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: [] })
  const cases = [
    [{ id: 'p1', name: 'x' }, 'İsim 2-40 karakter olmalı.'],
    [{ id: 'p1', color: 'nope' }, 'Renk #rrggbb biçiminde olmalı.'],
    [{ id: 'p1' }, 'Güncellenecek alan yok.'],
    [{ name: 'Yeni' }, 'id gerekli.'],
  ]
  for (const [body, message] of cases) {
    const res = await updatePlayer(sup, req(body, 'PATCH'))
    assert.equal(res.status, 400, `400 bekleniyordu: ${JSON.stringify(body)}`)
    assert.equal((await res.json()).error, message)
  }
})

suite.test('updatePlayer: bilinmeyen oyuncu 404 (gerçek supabase PGRST116 yolu)', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: [] })
  const res = await updatePlayer(sup, req({ id: 'hayalet', name: 'Yeni İsim' }, 'PATCH'))
  assert.equal(res.status, 404, 'bilinmeyen id dostça 404 olmalı (500 değil)')
  assert.equal((await res.json()).error, 'Oyuncu bulunamadı.')
})

suite.test('updatePlayer: başka oyuncunun ismi (case-insensitive) → 23505 → 400', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: [] })
  const res = await updatePlayer(sup, req({ id: 'p1', name: 'mert' }, 'PATCH'))
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'Bu isimde bir oyuncu zaten var.')
  assert.equal(sup.store.players.find(p => p.id === 'p1').name, 'Ogün', 'isim değişmedi')
})

// --- uploadAvatar / deleteAvatar (#17 profil fotoğrafları) ---

// Magic-byte önekli minimal test görselleri (gerçek decode gerekmez).
const b64 = bytes => Buffer.from(bytes).toString('base64')
const JPEG_BYTES = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]
const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]
const RIFF_BYTES = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00]
const dataUrl = (mime, bytes) => `data:${mime};base64,${b64(bytes)}`
// Stub bucket'ı ilk yüklemede oluşur: yoksa boş dizi.
const avatarFiles = sup => Object.keys(sup.store.storage.avatars ?? {})

suite.test('uploadAvatar: mutlu yol — 200, storage dolu, players.avatar_url güncel', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const res = await uploadAvatar(sup, req({ playerId: 'p1', dataUrl: dataUrl('image/jpeg', JPEG_BYTES) }))
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

suite.test('uploadAvatar: ikinci yükleme YENİ ad alır, eski dosya silinir', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const first = await uploadAvatar(sup, req({ playerId: 'p1', dataUrl: dataUrl('image/jpeg', JPEG_BYTES) }))
  assert.equal(first.status, 200)
  const url1 = (await first.json()).avatarUrl
  // versiyonlu ad Date.now() içerdiği için benzersizliği garantiye al
  await new Promise(r => setTimeout(r, 5))
  const second = await uploadAvatar(sup, req({ playerId: 'p1', dataUrl: dataUrl('image/jpeg', JPEG_BYTES) }))
  assert.equal(second.status, 200)
  const url2 = (await second.json()).avatarUrl

  assert.notEqual(url1, url2, 'versiyonlu ad → cache-busting')
  const paths = Object.keys(sup.store.storage.avatars ?? {})
  assert.equal(paths.length, 1, 'eski dosya temizlendi')
  assert.ok(paths[0].startsWith('av-p1-'))
  assert.equal(`http://memory.local/storage/avatars/${paths[0]}`, url2, 'kalan dosya yeni yükleme')
  assert.equal(sup.store.players.find(p => p.id === 'p1').avatar_url, url2)
})

suite.test('uploadAvatar: magic-byte beyanla uyuşmaz ama whitelist türü → kabul, uzantı içerikten', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  // beyan PNG, içerik JPEG → belirleyici olan içerik: kabul + .jpg
  const res = await uploadAvatar(sup, req({ playerId: 'p1', dataUrl: dataUrl('image/png', JPEG_BYTES) }))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.ok(body.avatarUrl.endsWith('.jpg'))
  // beyan JPEG, içerik WebP (RIFF) → kabul + .webp
  const res2 = await uploadAvatar(sup, req({ playerId: 'p2', dataUrl: dataUrl('image/jpeg', RIFF_BYTES) }))
  assert.equal(res2.status, 200)
  assert.ok((await res2.json()).avatarUrl.endsWith('.webp'))
})

suite.test('uploadAvatar: geçersiz MIME beyanı 400', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  // data:image/* önekli ama beyaz liste dışı beyanlar
  for (const mime of ['image/gif', 'image/bmp', 'image/svg+xml']) {
    const res = await uploadAvatar(sup, req({ playerId: 'p1', dataUrl: dataUrl(mime, JPEG_BYTES) }))
    assert.equal(res.status, 400, `mime=${mime} → 400`)
    assert.equal((await res.json()).error, 'Görsel türü JPEG, PNG veya WebP olmalı.')
  }
})

suite.test('uploadAvatar: 512 KB üzeri gövde 400', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const big = Buffer.alloc(512 * 1024 + 1)
  big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff // geçerli JPEG öneki, ama boyut sınırı aşılır
  const res = await uploadAvatar(sup, req({ playerId: 'p1', dataUrl: dataUrl('image/jpeg', big) }))
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'Görsel en fazla 512 KB olabilir.')
  assert.equal(Object.keys(sup.store.storage.avatars ?? {}).length, 0, 'hiçbir şey yüklenmez')
  assert.equal(sup.store.players.find(p => p.id === 'p1').avatar_url, undefined, 'satır dokunulmaz')
})

suite.test('uploadAvatar: magic-byte uyuşmayan içerik 400 (beyan geçerli olsa bile)', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const junk = [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]
  const res = await uploadAvatar(sup, req({ playerId: 'p1', dataUrl: dataUrl('image/jpeg', junk) }))
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'Dosya içeriği geçerli bir görsel değil (JPEG, PNG, WebP).')
  assert.equal(Object.keys(sup.store.storage.avatars ?? {}).length, 0)
})

suite.test('uploadAvatar: bozuk dataUrl ve eksik playerId 400', async () => {
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
    const res = await uploadAvatar(sup, req(body))
    assert.equal(res.status, 400, `400 bekleniyordu: ${JSON.stringify(body).slice(0, 60)}`)
  }
  assert.equal(Object.keys(sup.store.storage.avatars ?? {}).length, 0)
  assert.equal(sup.store.players.find(p => p.id === 'p1').avatar_url, undefined)
})

suite.test('uploadAvatar: bilinmeyen oyuncu 404', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const res = await uploadAvatar(sup, req({ playerId: 'hayalet', dataUrl: dataUrl('image/jpeg', JPEG_BYTES) }))
  assert.equal(res.status, 404)
  assert.equal((await res.json()).error, 'Oyuncu bulunamadı.')
  assert.equal(Object.keys(sup.store.storage.avatars ?? {}).length, 0, '404 yolunda yükleme yapılmaz')
})

suite.test('uploadAvatar: av- önekine uymayan eski URL dokunulmaz (güvenlik gardiyanı)', async () => {
  const sup = createMemorySupabase({
    players: [
      { ...basePlayers()[0], avatar_url: 'http://memory.local/storage/avatars/manual-set.jpg' },
    ],
    storage: { avatars: { 'manual-set.jpg': Buffer.from([1, 2, 3]) } },
  })
  const res = await uploadAvatar(sup, req({ playerId: 'p1', dataUrl: dataUrl('image/jpeg', JPEG_BYTES) }))
  assert.equal(res.status, 200)
  const paths = Object.keys(sup.store.storage.avatars ?? {})
  assert.equal(paths.length, 2, 'yeni dosya + dokunulmamış yabancı dosya')
  assert.ok(paths.includes('manual-set.jpg'), 'başka oyuncuya/dosyaya ait path asla silinmez')
})

suite.test('deleteAvatar: dosyayı siler, avatar_url null olur', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const up = await uploadAvatar(sup, req({ playerId: 'p1', dataUrl: dataUrl('image/jpeg', JPEG_BYTES) }))
  assert.equal(up.status, 200)
  const path1 = Object.keys(sup.store.storage.avatars ?? {})[0]

  const res = await deleteAvatar(sup, req({ playerId: 'p1' }, 'DELETE'))
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

suite.test('deleteAvatar: avataru olmayan oyuncu → 200, null kalır', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const res = await deleteAvatar(sup, req({ playerId: 'p2' }, 'DELETE'))
  assert.equal(res.status, 200)
  assert.equal((await res.json()).player.avatar_url, null)
})

suite.test('deleteAvatar: playerId yoksa 400, oyuncu yoksa 404', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const missing = await deleteAvatar(sup, req({}, 'DELETE'))
  assert.equal(missing.status, 400)
  assert.equal((await missing.json()).error, 'playerId gerekli.')

  const ghost = await deleteAvatar(sup, req({ playerId: 'hayalet' }, 'DELETE'))
  assert.equal(ghost.status, 404)
  assert.equal((await ghost.json()).error, 'Oyuncu bulunamadı.')
})

suite.test('deleteAvatar: playerId query string\'den de okunur', async () => {
  const sup = createMemorySupabase({ players: basePlayers() })
  const res = await deleteAvatar(sup, new Request('http://localhost:8787/api/admin/players/avatar?playerId=p1', { method: 'DELETE' }))
  assert.equal(res.status, 200)
  assert.equal((await res.json()).ok, true)
})

// --- saveScoring ---

suite.test('saveScoring: doğrulama hataları 400', async () => {
  const sup = createMemorySupabase()
  const cases = [
    { correctOutcome: 101, message: 'Puan 0-100 arası tam sayı olmalı.' },
    { correctOutcome: -1, message: 'Puan 0-100 arası tam sayı olmalı.' },
    { correctOutcome: 2.5, message: 'Puan 0-100 arası tam sayı olmalı.' },
    { correctOutcome: 'abc', message: 'Puan 0-100 arası tam sayı olmalı.' },
    { status: 'bogus', message: 'Durum provisional veya final olmalı.' },
    { label: 'x'.repeat(81), message: 'Etiket 1-80 karakter olmalı.' },
    { label: '', message: 'Etiket 1-80 karakter olmalı.' },
  ]
  for (const body of cases) {
    const res = await saveScoring(sup, req(body))
    assert.equal(res.status, 400, `400 bekleniyordu: ${JSON.stringify(body).slice(0, 40)}`)
    assert.equal((await res.json()).error, body.message)
  }
  // Hatalı istekler mevcut config'i bozmaz
  assert.deepEqual(
    sup.store.app_config.find(c => c.key === 'scoring').value,
    { label: 'Doğru sonuç 1 puan', status: 'provisional', correctOutcome: 1 },
  )
})

suite.test('saveScoring: tam güncelleme app_config\'e upsert edilir', async () => {
  const sup = createMemorySupabase()
  const res = await saveScoring(sup, req({ label: 'Yeni kural', status: 'final', correctOutcome: 2 }))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(body.scoring, { label: 'Yeni kural', status: 'final', correctOutcome: 2 })
  assert.deepEqual(
    sup.store.app_config.find(c => c.key === 'scoring').value,
    { label: 'Yeni kural', status: 'final', correctOutcome: 2 },
  )
})

suite.test('saveScoring: kısmi güncelleme varsayılanla birleşir; satır yoksa oluşturur', async () => {
  const sup = createMemorySupabase({ app_config: [] })
  const res = await saveScoring(sup, req({ correctOutcome: 3 }))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.scoring.label, 'Doğru sonuç 1 puan', 'etiket varsayıldan gelir')
  assert.equal(body.scoring.status, 'provisional')
  assert.equal(body.scoring.correctOutcome, 3)
  assert.equal(sup.store.app_config.length, 1, 'satır upsert ile oluştu')
  assert.equal(sup.store.app_config[0].key, 'scoring')
})

// --- sync ---

suite.test('sync: syncNow başarılıysa 200 + sonuç', async () => {
  const sy = seasonYear()
  const ev = espnEvent({
    id: 701,
    seasonYear: sy,
    date: iso(Date.now() - hour),
    statusName: 'STATUS_FINAL',
    state: 'post',
    home: { displayName: 'Galatasaray SK', score: { displayValue: '2' } },
    away: { displayName: 'Barcelona', score: { displayValue: '1' } },
  })
  const sup = createMemorySupabase()
  const stub = withStubbedFetch([['uefa.champions/scoreboard', { events: [ev] }]])
  try {
    const res = await sync(sup)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.ok, true)
    assert.equal(body.matchesSeen, 1)
    assert.equal(body.changed, 1)
    assert.equal(body.complete, true)
    assert.equal(sup.store.matches.length, 1)
    assert.equal(sup.store.matches[0].status, 'FINISHED')
  } finally {
    stub.restore()
  }
})

suite.test('sync: kaynak tamamen hatalıysa 502', async () => {
  const sup = createMemorySupabase()
  const stub = withStubbedFetch([], { defaultJson: new Error('ağ erişimi yok') })
  try {
    const res = await sync(sup)
    assert.equal(res.status, 502)
    const body = await res.json()
    assert.equal(body.ok, false)
    assert.match(body.error, /Senkronizasyon kayıt döndürmedi/)
    assert.equal(sup.store.matches.length, 0)
  } finally {
    stub.restore()
  }
})

await runIfMain(suite)
export { suite }
