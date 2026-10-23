// E · lib/sync.js testleri — memory supabase + stub'lanmış fetch.
// fetchTrackedMatches monkey-patch edilemediği için gerçek espn.js
// hattı stub'lanmış global.fetch üzerinden koşar (offline).

import assert from 'node:assert/strict'
import { seasonYear } from '../../lib/espn.js'
import { maybeSync, syncNow } from '../../lib/sync.js'
import {
  createMemorySupabase,
  createSuite,
  espnEvent,
  hour,
  iso,
  runIfMain,
  withStubbedFetch,
} from './helpers.mjs'

const suite = createSuite('E · lib/sync.js')

// Tek zaman noktası: tohum satırları ile fikstür tarihleri bire bir aynı olsun.
const T0 = Date.now()
const SY = seasonYear()
const CHAMPIONS = 'uefa.champions/scoreboard' // yıl duyarsız (dates=SY ve SY+1 ikisi de)

const evFinished = () => espnEvent({
  id: 601,
  seasonYear: SY,
  date: iso(T0 - 96 * hour),
  statusName: 'STATUS_FINAL',
  state: 'post',
  home: { displayName: 'Galatasaray SK', shortDisplayName: 'Galatasaray', score: { displayValue: '1' } },
  away: { displayName: 'Barcelona', score: { displayValue: '4' } },
})

const evLive = clock => espnEvent({
  id: 602,
  seasonYear: SY,
  date: iso(T0 - hour),
  statusName: 'STATUS_IN_2',
  state: 'in',
  clock,
  home: { displayName: 'Fenerbahce SK', score: { displayValue: '1' } },
  away: { displayName: 'Lyon', score: { displayValue: '0' } },
})

// espn:601'in STATUS_SCHEDULED (TIMED) dönen gecikmiş hâli — skorlar yok sayılır.
const evStale = () => espnEvent({
  id: 601,
  seasonYear: SY,
  date: iso(T0 - 96 * hour),
  statusName: 'STATUS_SCHEDULED',
  state: 'pre',
  timeValid: true,
  home: { displayName: 'Galatasaray SK' },
  away: { displayName: 'Barcelona' },
})

const storedRow = (id, ext, status, kickoffMs, hs, as, homeName, awayName, minute = null) => ({
  id,
  provider: 'espn',
  external_id: ext,
  competition: 'CL',
  kickoff: iso(kickoffMs),
  status,
  minute,
  home_name: homeName,
  home_short: homeName,
  home_tla: null,
  home_crest: null,
  away_name: awayName,
  away_short: awayName,
  away_tla: null,
  away_crest: null,
  home_score: hs,
  away_score: as,
  matchday: 1,
  stage: null,
  updated_at: '2026-01-01T00:00:00.000Z',
})

const syncWith = async (sup, routes, opts) => {
  const stub = withStubbedFetch(routes, opts)
  try {
    return await syncNow(sup)
  } finally {
    stub.restore()
  }
}

// --- S1: ilk senkron ---

let sup
suite.test('ilk tur: maçlar yazılır, sync_state güncellenir', async () => {
  sup = createMemorySupabase()
  const result = await syncWith(sup, [[CHAMPIONS, { events: [evFinished(), evLive("55'")] }]])
  assert.deepEqual(result, { ok: true, matchesSeen: 2, changed: 2, complete: true })

  assert.equal(sup.store.matches.length, 2)
  const m601 = sup.store.matches.find(m => m.external_id === '601')
  assert.equal(m601.status, 'FINISHED')
  assert.equal(m601.home_name, 'Galatasaray')
  assert.equal(m601.home_score, 1)
  assert.equal(m601.away_score, 4)
  const m602 = sup.store.matches.find(m => m.external_id === '602')
  assert.equal(m602.status, 'IN_PLAY')
  assert.equal(m602.minute, 55)
  assert.equal(m602.home_name, 'Fenerbahçe', 'kanonik ad saklanır')

  const state = sup.store.sync_state[0]
  assert.ok(state.last_success_at, 'last_success_at yazılır')
  assert.ok(state.last_attempt_at, 'last_attempt_at yazılır')
  assert.equal(state.last_error, null)
  assert.equal(state.matches_seen, 2)
})

suite.test('ikinci tur aynı veriyle: changed=0, satırlara dokunulmaz', async () => {
  const stampsBefore = sup.store.matches.map(m => m.updated_at)
  const result = await syncWith(sup, [[CHAMPIONS, { events: [evFinished(), evLive("55'")] }]])
  assert.equal(result.changed, 0, 'aynı imza → yazma yok')
  assert.equal(result.matchesSeen, 2)
  assert.deepEqual(sup.store.matches.map(m => m.updated_at), stampsBefore, 'updated_at değişmedi')
})

suite.test('dakika değişimi yeniden yazılır', async () => {
  const result = await syncWith(sup, [[CHAMPIONS, { events: [evFinished(), evLive("61'")] }]])
  assert.equal(result.changed, 1)
  assert.equal(sup.store.matches.find(m => m.external_id === '602').minute, 61)
})

suite.test('anti-regression: FINISHED→SCHEDULED geri alınmaz, prune de etmez', async () => {
  const result = await syncWith(sup, [[CHAMPIONS, { events: [evStale(), evLive("61'")] }]])
  assert.equal(result.changed, 0, 'gecikmiş yanıt yazılmaz')
  assert.equal(sup.store.matches.length, 2, 'maç silinmez/değişmez')
  const m601 = sup.store.matches.find(m => m.external_id === '601')
  assert.equal(m601.status, 'FINISHED', 'bitmiş statü korunur')
  assert.equal(m601.home_score, 1, 'skor korunur')
  assert.equal(m601.away_score, 4)
})

// --- S5: prune yalnız complete iken ---

const prunableSeed = () => ({
  matches: [
    storedRow('m1', '601', 'FINISHED', T0 - 96 * hour, 1, 4, 'Galatasaray', 'Barcelona'),
    storedRow('m2', '602', 'IN_PLAY', T0 - hour, 1, 0, 'Fenerbahçe', 'Lyon', 61),
    storedRow('m9', '699', 'TIMED', T0 + 72 * hour, null, null, 'Beşiktaş', 'Marseille'),
  ],
})

suite.test('kaynak hatasında (complete=false) eski kayıtlar korunur', async () => {
  const sup5 = createMemorySupabase(prunableSeed())
  const result = await syncWith(sup5, [
    [CHAMPIONS, { events: [evFinished(), evLive("61'")] }],
    ['uefa.europa.conf/scoreboard', new Error('UECL kaynağı kapalı')],
  ])
  assert.equal(result.complete, false)
  assert.equal(result.changed, 0)
  assert.ok(sup5.store.matches.some(m => m.external_id === '699'), 'takip dışı kayıt hayatta')

  const state = sup5.store.sync_state[0]
  assert.ok(state.last_error.includes('uefa.europa.conf'), 'hata last_error\'a yazılır')
  assert.ok(state.last_success_at, 'kısmi başarıda da last_success_at yazılır')
})

suite.test('tüm kaynaklar sağlamsa takip dışı kayıt prune edilir', async () => {
  const sup5 = createMemorySupabase(prunableSeed())
  const result = await syncWith(sup5, [[CHAMPIONS, { events: [evFinished(), evLive("61'")] }]])
  assert.equal(result.complete, true)
  assert.equal(result.changed, 0)
  assert.equal(sup5.store.matches.length, 2, 'm9 silindi')
  assert.ok(!sup5.store.matches.some(m => m.external_id === '699'))
  assert.equal(sup5.store.sync_state[0].last_error, null)
})

// --- S6: boş sonuç ---

suite.test('sıfır maç dönerse hata fırlar ve last_error yazılır', async () => {
  const sup6 = createMemorySupabase()
  await assert.rejects(
    () => syncWith(sup6, []),
    /Senkronizasyon kayıt döndürmedi/,
    'boş sonuç kabul edilemez',
  )
  assert.ok(sup6.store.sync_state[0].last_error.includes('Senkronizasyon kayıt döndürmedi'))
  assert.equal(sup6.store.matches.length, 0)
})

// --- S7: maybeSync ---

suite.test('maybeSync: veri tazeyse fetch çağrılmaz', async () => {
  const sup7 = createMemorySupabase({
    sync_state: [{ id: 1, last_attempt_at: iso(T0), last_success_at: iso(Date.now()), last_error: null, matches_seen: 2, updated_at: iso(T0) }],
  })
  const stub = withStubbedFetch([[CHAMPIONS, { events: [evFinished()] }]])
  try {
    await maybeSync(sup7, 90)
    assert.equal(stub.calls.length, 0, 'taze veri → senkron yok')
  } finally {
    stub.restore()
  }
})

suite.test('maybeSync: veri bayatsa senkron çalışır; hata yutulur', async () => {
  const stale = {
    sync_state: [{ id: 1, last_attempt_at: iso(T0), last_success_at: iso(Date.now() - 2 * hour), last_error: null, matches_seen: 0, updated_at: iso(T0) }],
  }
  const supOk = createMemorySupabase(stale)
  const stub = withStubbedFetch([[CHAMPIONS, { events: [evFinished(), evLive("55'")] }]])
  try {
    await maybeSync(supOk, 90)
    assert.ok(stub.calls.length > 0, 'bayat veri → senkron tetiklenir')
    assert.equal(supOk.store.matches.length, 2)
  } finally {
    stub.restore()
  }

  const supFail = createMemorySupabase(stale)
  const stubFail = withStubbedFetch([], { defaultJson: new Error('ağ yok') })
  try {
    await assert.doesNotReject(() => maybeSync(supFail, 90), 'senkron hatası yutulmalı')
    assert.equal(supFail.store.matches.length, 0)
  } finally {
    stubFail.restore()
  }
})

await runIfMain(suite)
export { suite }
