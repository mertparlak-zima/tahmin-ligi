// D1 · api/predictions.js uç testleri — süreç içi Request nesneleri + memory
// supabase (request.supabase enjeksiyonu; HTTP sunucusu başlatılmaz).
// #24 Faz 1: şifreli admin ucu kaldırıldı; PUT /api/predictions herkese açık.

import assert from 'node:assert/strict'
import { PUT } from '../../api/predictions.js'
import { seasonYear } from '../../lib/espn.js'
import { createMemorySupabase, createSuite, hour, iso, runIfMain } from './helpers.mjs'

const suite = createSuite('D1 · api/predictions.js (PUT /api/predictions)')

// Named method export doğrudan çağrılır; supabase isteğe enjekte edilir
// (demo sunucu deseni — üretimde env tabanlı istemci kurulur).
const call = (sup, body, method = 'PUT') => {
  const req = new Request('http://localhost:8787/api/predictions', {
    method,
    body: JSON.stringify(body ?? {}),
    headers: { 'content-type': 'application/json' },
  })
  req.supabase = sup
  return PUT(req)
}

const row = o => ({
  provider: 'espn', minute: null,
  home_tla: null, away_tla: null, home_crest: null, away_crest: null,
  matchday: 1, stage: null,
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

// --- mutlu yol ---

suite.test('mutlu yol: kaydeder, kimlik doğrulama istemez (public)', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: baseMatches(Date.now()) })
  // Authorization başlığı YOK — uç herkese açık (#24).
  const res = await call(sup, { playerId: 'p1', items: [{ matchId: 'm-open', outcome: 'H' }] })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(body, { ok: true, saved: 1, deleted: 0, player: 'Ogün' })
  assert.equal(sup.store.predictions.length, 1)
  assert.equal(sup.store.predictions[0].outcome, 'H')
  assert.equal(sup.store.predictions[0].match_id, 'm-open')
})

suite.test('boş outcome siler, dolu upsert eder', async () => {
  const sup = createMemorySupabase({
    players: basePlayers(),
    matches: baseMatches(Date.now()),
    predictions: [
      { player_id: 'p1', match_id: 'm-open', outcome: 'H', updated_at: iso(Date.now()) },
      { player_id: 'p1', match_id: 'm-open2', outcome: 'D', updated_at: iso(Date.now()) },
    ],
  })
  const res = await call(sup, {
    playerId: 'p1',
    items: [{ matchId: 'm-open', outcome: 'A' }, { matchId: 'm-open2', outcome: '' }],
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.saved, 1)
  assert.equal(body.deleted, 1)
  assert.equal(sup.store.predictions.length, 1)
  assert.equal(sup.store.predictions[0].match_id, 'm-open')
  assert.equal(sup.store.predictions[0].outcome, 'A', 'upsert üzerine yazar')
})

// --- kilit kuralı (KORUNUR #24) ---

suite.test('kilitli maç → 409 VE batch\'in hiçbiri yazılmaz (atomik)', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: baseMatches(Date.now()) })
  const before = sup.store.predictions.length
  const res = await call(sup, {
    playerId: 'p1',
    items: [{ matchId: 'm-open', outcome: 'H' }, { matchId: 'm-live', outcome: 'A' }],
  })
  assert.equal(res.status, 409)
  assert.equal((await res.json()).error, 'Başlamış veya bitmiş bir maça tahmin kaydedilemez.')
  assert.equal(sup.store.predictions.length, before, 'atomik: açık maç da yazılmadı')

  const resFin = await call(sup, { playerId: 'p1', items: [{ matchId: 'm-fin', outcome: 'H' }] })
  assert.equal(resFin.status, 409, 'bitmiş maç kilitli')
  const resPost = await call(sup, { playerId: 'p1', items: [{ matchId: 'm-post', outcome: 'H' }] })
  assert.equal(resPost.status, 409, 'ertelenen maç kilitli')
  assert.equal(sup.store.predictions.length, before)
})

suite.test('geçmiş kickoff\'lu TIMED maç da kilitli', async () => {
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
  const res = await call(sup, { playerId: 'p1', items: [{ matchId: 'm-late', outcome: 'H' }] })
  assert.equal(res.status, 409, 'kickoff geçtiyse giriş kilit')
  assert.equal(sup.store.predictions.length, 0)
})

// --- doğrulama ---

suite.test('geçersiz girişler 400 (outcome/tekrar/eksik alan/limit)', async () => {
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
    const res = await call(sup, body)
    assert.equal(res.status, 400, `400 bekleniyordu: ${JSON.stringify(body).slice(0, 60)}`)
  }
  assert.equal(sup.store.predictions.length, 0, 'hiçbir geçersiz istek yazmaz')
})

suite.test('bozuk JSON gövdesi 400', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: baseMatches(Date.now()) })
  const req = new Request('http://localhost:8787/api/predictions', {
    method: 'PUT',
    body: '{bozuk',
    headers: { 'content-type': 'application/json' },
  })
  req.supabase = sup
  const res = await PUT(req)
  assert.equal(res.status, 400, 'JSON çözülemedi → boş gövde → playerId yok')
  assert.equal(sup.store.predictions.length, 0)
})

suite.test('#24 review: null gövde ve null item 400 (500 değil)', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: baseMatches(Date.now()) })
  // body: null (JSON null)
  const nullBody = new Request('http://localhost:8787/api/predictions', {
    method: 'PUT',
    body: 'null',
    headers: { 'content-type': 'application/json' },
  })
  nullBody.supabase = sup
  assert.equal((await PUT(nullBody)).status, 400)
  // items içinde null öğe → matchId erişimi patlamamalı, 400 dönmalı
  const res = await call(sup, { playerId: 'p1', items: [null] })
  assert.equal(res.status, 400)
  // uuid olmayan matchId → 400 (PostgREST 22P02 sızması yok)
  const res2 = await call(sup, { playerId: 'p1', items: [{ matchId: 'm-open; drop', outcome: 'H' }] })
  assert.equal(res2.status, 400)
  // güvenli-aralık dışı playerId → 400; geçerli-biçim ama bilinmeyen → 404
  const res3 = await call(sup, { playerId: "x'; --", items: [{ matchId: 'm-open', outcome: 'H' }] })
  assert.equal(res3.status, 400)
  const res4 = await call(sup, { playerId: 'yok-boyle-bir', items: [{ matchId: 'm-open', outcome: 'H' }] })
  assert.equal(res4.status, 404)
  assert.equal(sup.store.predictions.length, 0)
})

suite.test('bilinmeyen oyuncu 404, bilinmeyen maç 404', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: baseMatches(Date.now()) })
  const resPlayer = await call(sup, {
    playerId: 'yok', items: [{ matchId: 'm-open', outcome: 'H' }],
  })
  assert.equal(resPlayer.status, 404)
  assert.equal((await resPlayer.json()).error, 'Oyuncu bulunamadı.')

  const resMatch = await call(sup, {
    playerId: 'p1', items: [{ matchId: 'hayalet', outcome: 'H' }],
  })
  assert.equal(resMatch.status, 404)
  assert.equal((await resMatch.json()).error, 'Maç bulunamadı.')
  assert.equal(sup.store.predictions.length, 0)
})

suite.test('yanlış yöntem 405', async () => {
  const sup = createMemorySupabase({ players: basePlayers(), matches: baseMatches(Date.now()) })
  const res = await call(sup, { playerId: 'p1', items: [{ matchId: 'm-open', outcome: 'H' }] }, 'POST')
  assert.equal(res.status, 405)
  assert.equal(sup.store.predictions.length, 0)
})

await runIfMain(suite)
export { suite }
