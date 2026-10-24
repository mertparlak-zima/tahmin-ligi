// E · lib/sync.js testleri — memory supabase + stub'lanmış fetch.
// fetchTrackedMatches monkey-patch edilemediği için gerçek espn.js
// hattı stub'lanmış global.fetch üzerinden koşar (offline).

import assert from 'node:assert/strict'
import { seasonYear } from '../../lib/espn.js'
import { maybeSync, staleThresholdSeconds, syncNow } from '../../lib/sync.js'
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

// Gelecek kickoff'lu takip edilen maçlar (prune guard / P8 fixture'ı).
const evUpcoming = (id, ms = T0 + 80 * hour) => espnEvent({
  id,
  seasonYear: SY,
  date: iso(ms),
  statusName: 'STATUS_SCHEDULED',
  state: 'pre',
  timeValid: true,
  home: { displayName: 'Galatasaray SK' },
  away: { displayName: 'Barcelona' },
})

const EUROPA = 'uefa.europa/scoreboard' // conf slug'ını eşlemez
const evEl = () => espnEvent({
  id: 8101,
  seasonYear: SY,
  date: iso(T0 + 30 * hour),
  statusName: 'STATUS_SCHEDULED',
  state: 'pre',
  timeValid: true,
  home: { displayName: 'Fenerbahce SK' },
  away: { displayName: 'Lyon' },
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
  // Dondurulmuş flag'ler (P5): tohum satırları da gerçek şemadaki gibi taşır.
  season_year: SY,
  league: 'EU',
  updated_at: '2026-01-01T00:00:00.000Z',
})

const syncWith = async (sup, routes, opts, syncOpts) => {
  const stub = withStubbedFetch(routes, opts)
  try {
    return await syncNow(sup, syncOpts)
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
  assert.equal(m602.season_year, SY, 'yeni satır kickofftan sezon alır')
  assert.equal(m602.league, 'EU', 'yeni satır aktif ligi alır')

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

suite.test('maybeSync: taze deneme (uçuştaki senkron) varken tekrar denemez — stampede koruması', async () => {
  const supStampede = createMemorySupabase({
    sync_state: [{ id: 1, last_attempt_at: iso(Date.now() - 5 * 1000), last_success_at: iso(Date.now() - 2 * hour), last_error: null, matches_seen: 0, updated_at: iso(T0) }],
  })
  const stub = withStubbedFetch([[CHAMPIONS, { events: [evFinished()] }]])
  try {
    await maybeSync(supStampede, 90)
    assert.equal(stub.calls.length, 0, 'deneme penceresi içinde → yeni senkron yok')
  } finally {
    stub.restore()
  }
})

suite.test('maybeSync: veri bayatsa senkron çalışır; hata yutulur', async () => {
  const stale = {
    sync_state: [{ id: 1, last_attempt_at: iso(Date.now() - 2 * hour), last_success_at: iso(Date.now() - 2 * hour), last_error: null, matches_seen: 0, updated_at: iso(T0) }],
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

// --- S8: prune koruması (v6 P1) ---

suite.test('prune: kickoff\'u geçmiş tahminsiz satır silinmez', async () => {
  const sup8 = createMemorySupabase({
    matches: [storedRow('mp', '701', 'TIMED', T0 - 48 * hour, null, null, 'Fenerbahçe', 'Eski Rakip')],
  })
  const result = await syncWith(sup8, [[CHAMPIONS, { events: [evFinished()] }]])
  assert.equal(result.complete, true)
  assert.ok(sup8.store.matches.some(m => m.external_id === '701'), 'geçmiş kickofflu satır prune edilmez')
})

suite.test('prune: tahminli gelecek maç asla silinmez (cascade taklidiyle tahmin de kalır)', async () => {
  const sup8 = createMemorySupabase({
    matches: [storedRow('mt', '702', 'TIMED', T0 + 72 * hour, null, null, 'Beşiktaş', 'Marseille')],
    predictions: [{ player_id: 'p1', match_id: 'mt', outcome: 'H' }],
  })
  const result = await syncWith(sup8, [[CHAMPIONS, { events: [evFinished()] }]])
  assert.equal(result.complete, true)
  assert.ok(sup8.store.matches.some(m => m.external_id === '702'), 'tahminli maç prune edilmez')
  assert.equal(sup8.store.predictions.length, 1, 'prune olsaydı tahmin cascade\'le düşerdi — düşmedi')
})

// --- S9: turnuva guard'ı (v6 P1) ---

const guardSeed = clCount => ({
  matches: Array.from({ length: clCount }, (_, i) =>
    storedRow(`g${i + 1}`, String(9001 + i), 'TIMED', T0 + 72 * hour, null, null, 'Beşiktaş', `Rakip ${i + 1}`)),
})

suite.test('guard: DB 16 CL adayı / yanıt 7 CL → CL prune atlanır, diğer turnuva prune edilir', async () => {
  const sup9 = createMemorySupabase({
    matches: [
      ...guardSeed(16).matches,
      { ...storedRow('ge1', '9101', 'TIMED', T0 + 72 * hour, null, null, 'Fenerbahçe', 'Rakip'), competition: 'EL' },
      { ...storedRow('ge2', '9102', 'TIMED', T0 + 72 * hour, null, null, 'Fenerbahçe', 'Rakip 2'), competition: 'EL' },
    ],
  })
  const response = Array.from({ length: 7 }, (_, i) => evUpcoming(8001 + i, T0 + (80 + i) * hour))
  const result = await syncWith(sup9, [[CHAMPIONS, { events: response }]])
  assert.equal(result.complete, true)
  for (let i = 0; i < 16; i += 1) {
    assert.ok(sup9.store.matches.some(m => m.external_id === String(9001 + i)), `CL adayı ${9001 + i} silinmedi`)
  }
  assert.ok(!sup9.store.matches.some(m => m.external_id === '9101'), 'EL adayı (yanıtta yok, <4) prune edilir')
  assert.ok(!sup9.store.matches.some(m => m.external_id === '9102'), 'guard turnuva bazlı çalışır')
  assert.equal(sup9.store.matches.length, 23, '16 aday + 7 yanıt satırı kalır')
})

suite.test('guard: DB 16 CL adayı / yanıt 8 CL → ceil(16/2)=8 sınırında prune çalışır', async () => {
  const sup9 = createMemorySupabase(guardSeed(16))
  const response = Array.from({ length: 8 }, (_, i) => evUpcoming(8001 + i, T0 + (80 + i) * hour))
  const result = await syncWith(sup9, [[CHAMPIONS, { events: response }]])
  assert.equal(result.complete, true)
  assert.equal(sup9.store.matches.filter(m => Number(m.external_id) >= 9001 && Number(m.external_id) <= 9016).length, 0, 'adaylar silindi')
  assert.equal(sup9.store.matches.length, 8, 'yalnız yanıt satırları kalır')
})

suite.test('guard: DB<4 adayta guard devre dışı → prune çalışır', async () => {
  const sup9 = createMemorySupabase(guardSeed(3))
  // Yanıtta hiç CL maçı yok; complete=true için 1 EL maçı dönüyor.
  const result = await syncWith(sup9, [[EUROPA, { events: [evEl()] }]])
  assert.equal(result.complete, true)
  assert.equal(sup9.store.matches.filter(m => Number(m.external_id) >= 9001).length, 0, '3 aday da silinir')
  assert.equal(sup9.store.matches.length, 1, 'EL maçı yazıldı')
})

// --- S10: temizlik vanası (v6 P1) ---

suite.test('temizlik vanası: INACTIVE + 30+ gün geçmiş + tahminsiz silinir; 29 günlük kalır', async () => {
  const supV = createMemorySupabase({
    matches: [
      storedRow('v1', '9301', 'POSTPONED', T0 - 31 * 24 * hour, null, null, 'Fenerbahçe', 'Eski Rakip'),
      storedRow('v2', '9302', 'CANCELLED', T0 - 29 * 24 * hour, null, null, 'Beşiktaş', 'Eski Rakip'),
    ],
  })
  const result = await syncWith(supV, [[CHAMPIONS, { events: [evFinished()] }]])
  assert.equal(result.complete, true)
  assert.ok(!supV.store.matches.some(m => m.external_id === '9301'), '31 günlük tahminsiz INACTIVE silinir')
  assert.ok(supV.store.matches.some(m => m.external_id === '9302'), '29 günlük satır henüz kalır')
})

suite.test('temizlik vanası: tahminli INACTIVE satır korunur', async () => {
  const supV = createMemorySupabase({
    matches: [storedRow('v3', '9303', 'SUSPENDED', T0 - 40 * 24 * hour, null, null, 'Galatasaray', 'Eski Rakip')],
    predictions: [{ player_id: 'p1', match_id: 'v3', outcome: 'H' }],
  })
  await syncWith(supV, [[CHAMPIONS, { events: [evFinished()] }]])
  assert.ok(supV.store.matches.some(m => m.external_id === '9303'), 'tahminli satır silinmez')
  assert.equal(supV.store.predictions.length, 1, 'tahmin de düşmez')
})

suite.test('temizlik vanası: complete=false ise vanalı satır da silinmez', async () => {
  const supV = createMemorySupabase({
    matches: [storedRow('v4', '9304', 'POSTPONED', T0 - 35 * 24 * hour, null, null, 'Fenerbahçe', 'Eski Rakip')],
  })
  const result = await syncWith(supV, [
    [CHAMPIONS, { events: [evFinished()] }],
    ['uefa.europa.conf/scoreboard', new Error('UECL kaynağı kapalı')],
  ])
  assert.equal(result.complete, false)
  assert.ok(supV.store.matches.some(m => m.external_id === '9304'), 'complete değilken vana çalışmaz')
})

// --- S11: statü kilidi (v6 P1 / R6) ---

suite.test('statü kilidi: FINISHED→POSTPONED upsert\'i reddedilir, skorlar korunur', async () => {
  const supL = createMemorySupabase({
    matches: [storedRow('sl', '601', 'FINISHED', T0 - 96 * hour, 1, 4, 'Galatasaray', 'Barcelona')],
  })
  const evPostponed = espnEvent({
    id: 601,
    seasonYear: SY,
    date: iso(T0 - 96 * hour),
    statusName: 'STATUS_POSTPONED',
    state: 'pre',
    timeValid: true,
    home: { displayName: 'Galatasaray SK' },
    away: { displayName: 'Barcelona' },
  })
  const result = await syncWith(supL, [[CHAMPIONS, { events: [evPostponed] }]])
  assert.equal(result.changed, 0, 'INACTIVE\'e çekme denemesi yazılmaz')
  const row = supL.store.matches.find(m => m.external_id === '601')
  assert.equal(row.status, 'FINISHED', 'bitmiş statü korunur')
  assert.equal(row.home_score, 1, 'skorlar korunur')
  assert.equal(row.away_score, 4)
})

// --- S12: fetch bütçesi (v6 P3) ---

suite.test('bütçe: hiç çözülmeyen kaynak + kısa deadline → tur bütçe içinde döner, yeni deneme açılmaz', async () => {
  const supB = createMemorySupabase()
  const stub = withStubbedFetch([], { defaultJson: { never: true } })
  const started = Date.now()
  try {
    await assert.rejects(
      () => syncNow(supB, { fetchDeadlineMs: 150 }),
      /Senkronizasyon kayıt döndürmedi/,
    )
    assert.ok(Date.now() - started < 2000, 'tur ~150 ms\'de döner, asılı kalmaz')
    assert.equal(stub.calls.length, 6, 'kaynak başına yalnız ilk deneme açılır')
    const state = supB.store.sync_state[0]
    assert.ok(state.last_error.includes('bütçe'), 'last_error bütçe notu taşır')
    assert.equal(state.last_success_at, null, 'başarısız tur başarı damgası almaz')
  } finally {
    stub.restore()
  }
})

suite.test('bütçe: gecikmeli kaynak deadline aşarsa tur yanıtı beklemez', async () => {
  const supB = createMemorySupabase()
  const stub = withStubbedFetch([
    [CHAMPIONS, { delayMs: 800, json: { events: [evFinished()] } }],
  ])
  const started = Date.now()
  try {
    await assert.rejects(
      () => syncNow(supB, { fetchDeadlineMs: 150 }),
      /Senkronizasyon kayıt döndürmedi/,
    )
    assert.ok(Date.now() - started < 600, '800 ms\'lik yanıt beklenmez, ~150 ms\'de döner')
    assert.equal(stub.calls.length, 6)
    assert.ok(supB.store.sync_state[0].last_error.includes('bütçe'))
  } finally {
    stub.restore()
  }
})

suite.test('bütçe: retry gecikmesi sırasında bütçe bitince ikinci deneme açılmaz', async () => {
  const supB = createMemorySupabase()
  const reset = Object.assign(new Error('bağlantı sıfırlandı'), { code: 'ECONNRESET' })
  const stub = withStubbedFetch([[`uefa.champions/scoreboard?dates=${SY}`, reset]])
  try {
    await assert.rejects(
      () => syncNow(supB, { fetchDeadlineMs: 300 }),
      /Senkronizasyon kayıt döndürmedi.*bütçe/s,
    )
    const clCalls = stub.calls.filter(u => u.includes(`uefa.champions/scoreboard?dates=${SY}`))
    assert.equal(clCalls.length, 1, 'retry sleep\'i sırasında bütçe bitti → yeni fetch açılmaz')
    assert.ok(supB.store.sync_state[0].last_error.includes('bütçe'))
  } finally {
    stub.restore()
  }
})

suite.test('bütçe: maybeSync hatayı yutar, bütçe içinde döner', async () => {
  const supM = createMemorySupabase({
    sync_state: [{
      id: 1,
      last_attempt_at: iso(Date.now() - 2 * hour),
      last_success_at: iso(Date.now() - 2 * hour),
      last_error: null,
      matches_seen: 0,
      updated_at: iso(T0),
    }],
  })
  const stub = withStubbedFetch([], { defaultJson: { never: true } })
  const started = Date.now()
  try {
    await assert.doesNotReject(() => maybeSync(supM, 90, { fetchDeadlineMs: 150 }))
    assert.ok(Date.now() - started < 2000, 'maybeSync bütçe içinde döner')
    assert.ok(supM.store.sync_state[0].last_error.includes('bütçe'), 'hata last_error\'e taşınır')
    assert.equal(stub.calls.length, 6)
  } finally {
    stub.restore()
  }
})

// --- S13: uyarlanabilir senkron aralığı (v6 P8) ---

suite.test('staleThresholdSeconds: canlı → canlı eşiği, ≤6 sa kickoff → 600, boşta → 3600', () => {
  const live = { status: 'IN_PLAY', kickoff: iso(T0 - hour) }
  const upcoming = { status: 'TIMED', kickoff: iso(T0 + 3 * hour) }
  const far = { status: 'TIMED', kickoff: iso(T0 + 72 * hour) }
  assert.equal(staleThresholdSeconds([far, live], 90, T0), 90, 'canlı maç → canlı eşiği')
  assert.equal(staleThresholdSeconds([far, upcoming], 90, T0), 600, '≤6 sa içinde kickoff → 600')
  assert.equal(staleThresholdSeconds([far], 90, T0), 3600, 'başka durum → 3600')
  assert.equal(staleThresholdSeconds([live], 45, T0), 45, 'canlı eşiği parametreyle override edilir')
  assert.equal(staleThresholdSeconds([], 90, T0), 3600, 'maç yok → boşta eşiği')
})

suite.test('maybeSync P8: boşta fikstürde 30 dk bayat veri taze sayılır → fetch yok', async () => {
  const supP = createMemorySupabase({
    matches: [storedRow('p8a', '9401', 'FINISHED', T0 - 5 * 24 * hour, 2, 0, 'Trabzonspor', 'Rakip')],
    sync_state: [{
      id: 1,
      last_attempt_at: iso(Date.now() - 30 * 60_000),
      last_success_at: iso(Date.now() - 30 * 60_000),
      last_error: null,
      matches_seen: 1,
      updated_at: iso(T0),
    }],
  })
  const stub = withStubbedFetch([[CHAMPIONS, { events: [evFinished()] }]])
  try {
    await maybeSync(supP, 90)
    assert.equal(stub.calls.length, 0, '3600 sn eşik içinde → senkron yok')
  } finally {
    stub.restore()
  }
})

suite.test('maybeSync P8: canlı maçta 90 sn eşiği uygulanır → 5 dk bayat veri senkronlanır', async () => {
  const supP = createMemorySupabase({
    matches: [storedRow('p8b', '9402', 'IN_PLAY', T0 - hour, 1, 0, 'Beşiktaş', 'Marseille', 55)],
    sync_state: [{
      id: 1,
      last_attempt_at: iso(Date.now() - 5 * 60_000),
      last_success_at: iso(Date.now() - 5 * 60_000),
      last_error: null,
      matches_seen: 1,
      updated_at: iso(T0),
    }],
  })
  const stub = withStubbedFetch([[CHAMPIONS, { events: [evFinished(), evLive("55'")] }]])
  try {
    await maybeSync(supP, 90)
    assert.ok(stub.calls.length > 0, 'canlı eşik (90 sn) aşılış → senkron tetiklenir')
  } finally {
    stub.restore()
  }
})

// --- S14: sezon/lig mimarisi (v6 P5/P6) ---

// Sezon devri simülasyonu: "şimdi" Eylül 2027'ye enjekte edilir → aktif sezon
// 2027; ESPN yanıtı yalnız 2027-28 sezonunun maçlarını içerir.
const ROLLOVER_NOW = new Date('2027-09-15T12:00:00Z')

suite.test('sezon devri: eski sezon/başka lig satırları kalır, prune yeni sezona sınırlı kalır', async () => {
  const supR = createMemorySupabase({
    matches: [
      // 2026-27 sezonundan bitmiş maç (kickoff geçmişte).
      { ...storedRow('r-old', '6101', 'FINISHED', Date.parse('2027-05-20T18:45:00Z'), 1, 0, 'Fenerbahçe', 'Rakip'), season_year: 2026 },
      // 2026-27 sezonundan Temmuz ötesine ertelenmiş maç (kickoff GELECEKTE —
      // kapsam olmasa futureCandidate olarak silinecekti).
      { ...storedRow('r-ert', '6102', 'POSTPONED', Date.parse('2027-10-01T18:45:00Z'), null, null, 'Beşiktaş', 'Rakip'), season_year: 2026 },
      // Başka lige ait, aktif sezon satırı: lige göre izolasyon.
      { ...storedRow('r-tsl', '6103', 'TIMED', Date.parse('2027-10-05T18:45:00Z'), null, null, 'Galatasaray', 'Rakip'), season_year: 2027, league: 'TSL' },
    ],
  })
  const evNewSeason = espnEvent({
    id: 6201,
    seasonYear: 2027,
    date: iso(Date.parse('2027-10-20T18:45:00Z')),
    statusName: 'STATUS_SCHEDULED',
    state: 'pre',
    timeValid: true,
    home: { displayName: 'Galatasaray SK' },
    away: { displayName: 'Barcelona' },
  })
  const result = await syncWith(supR, [['uefa.champions/scoreboard', { events: [evNewSeason] }]], undefined, { now: ROLLOVER_NOW })
  assert.equal(result.complete, true)
  assert.ok(supR.store.matches.some(m => m.external_id === '6101'), 'eski sezon bitmiş maçı kalır')
  assert.ok(supR.store.matches.some(m => m.external_id === '6102'), 'eski sezona ait ertelenmiş (gelecek kickofflu) maç kalır')
  assert.ok(supR.store.matches.some(m => m.external_id === '6103'), 'başka lige ait satıra dokunulmaz')
  const newRow = supR.store.matches.find(m => m.external_id === '6201')
  assert.equal(newRow.season_year, 2027, 'yeni satır yeni sezonu alır')
  assert.equal(newRow.league, 'EU')
  assert.equal(supR.store.matches.length, 4, 'hiçbir tohum satırı silinmedi')
})

suite.test('dondurulmuş flag: kickoff Temmuz ötesine kayınca season_year/league değişmez', async () => {
  const supF = createMemorySupabase({
    matches: [storedRow('f1', '6301', 'TIMED', T0 + 24 * hour, null, null, 'Fenerbahçe', 'Rakip')],
  })
  const movedKickoff = iso(Date.parse(`${SY + 1}-08-15T18:45:00Z`))
  const evMoved = espnEvent({
    id: 6301,
    seasonYear: SY, // hâlâ SY sezonunun maçı; sadece kickoff kaydı
    date: movedKickoff,
    statusName: 'STATUS_SCHEDULED',
    state: 'pre',
    timeValid: true,
    home: { displayName: 'Fenerbahce SK' },
    away: { displayName: 'Rakip' },
  })
  const result = await syncWith(supF, [[CHAMPIONS, { events: [evMoved] }]])
  assert.equal(result.changed, 1, 'kickoff değişimi yazılır')
  const row = supF.store.matches.find(m => m.external_id === '6301')
  assert.equal(Date.parse(row.kickoff), Date.parse(movedKickoff), 'kickoff güncellenir')
  assert.equal(row.season_year, SY, 'season_year dondurulmuş — yeni takvime kaysa bile değişmez')
  assert.equal(row.league, 'EU', 'league de dondurulmuş')
})

suite.test('imza karşılaştırması flag\'leri içermez: flag\'li aynı imza → yazılmaz, flag korunur', async () => {
  const supI = createMemorySupabase({
    matches: [
      { ...storedRow('i1', '601', 'FINISHED', T0 - 96 * hour, 1, 4, 'Galatasaray', 'Barcelona'), season_year: SY - 1 },
    ],
  })
  const result = await syncWith(supI, [[CHAMPIONS, { events: [evFinished()] }]])
  assert.equal(result.changed, 0, 'imza aynı → flag farkı yazma tetiklemez')
  assert.equal(supI.store.matches[0].season_year, SY - 1, 'frozen flag olduğu gibi kalır')
})

suite.test('R7 onarım: flag\'i null satır imza AYNI olsa bile yeniden yazılır', async () => {
  const supG = createMemorySupabase({
    matches: [
      { ...storedRow('g1', '601', 'FINISHED', T0 - 96 * hour, 1, 4, 'Galatasaray', 'Barcelona'), season_year: null, league: null },
    ],
  })
  const stampBefore = supG.store.matches[0].updated_at
  const result = await syncWith(supG, [[CHAMPIONS, { events: [evFinished()] }]])
  assert.equal(result.changed, 1, 'null flag onarım koşulu yeniden yazmayı tetikler')
  const row = supG.store.matches.find(m => m.external_id === '601')
  assert.equal(row.season_year, SY, 'season_year doluşur')
  assert.equal(row.league, 'EU', 'league dolar (varsayılan)')
  assert.notEqual(row.updated_at, stampBefore, 'satır gerçekten yeniden yazıldı')
  // İkinci tur: flag artık dolu + imza aynı → bir daha dokunulmaz.
  const second = await syncWith(supG, [[CHAMPIONS, { events: [evFinished()] }]])
  assert.equal(second.changed, 0, 'onarım sonrası tur normal atlamaya döner')
})

await runIfMain(suite)
export { suite }
