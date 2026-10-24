// C · lib/league.js testleri — mühür kuralları, puan durumu, meta, admin payload.

import assert from 'node:assert/strict'
import { buildAdminPayload, buildLeaguePayload } from '../../lib/league.js'
import { createMemorySupabase, createSuite, hour, iso, runIfMain } from './helpers.mjs'

const suite = createSuite('C · lib/league.js')

const now = Date.now()

// --- Ana senaryo ---
// m1 GS 1-4 BAR (bitti, A kazandı)      -96h
// m2 FB 2-1 GS derbi (bitti, H kazandı)  -72h
// m6 TS 2-0 KuPS (bitti, H kazandı)      -48h
// m5 GS - BJK POSTPONED (geçmişta!)       -2h  → mühürlü kalmalı
// m3 BJK 1-0 MAR IN_PLAY 55'              -1h  → açılmış, puan null
// m4 FB - Lyon TIMED                     +24h  → mühürlü

const row = o => ({
  provider: 'espn',
  minute: null,
  home_tla: null, away_tla: null, home_crest: null, away_crest: null,
  matchday: 1, stage: null,
  ...o,
})

const mainPlayers = [
  { id: 'p1', name: 'Ogün', color: '#b8f34a', is_active: true },
  { id: 'p2', name: 'Mert', color: '#5ce1e6', is_active: true },
  { id: 'p3', name: 'Eski', color: '#ff9f68', is_active: false },
  { id: 'p4', name: 'Ali', color: '#ffd05c', is_active: true },
]

const mainMatches = [
  row({
    id: 'm1', external_id: '1', competition: 'CL', kickoff: iso(now - 96 * hour), status: 'FINISHED',
    home_name: 'Galatasaray', home_short: 'Galatasaray',
    away_name: 'Barcelona', away_short: 'Barcelona',
    home_score: 1, away_score: 4,
  }),
  row({
    id: 'm2', external_id: '2', competition: 'CL', kickoff: iso(now - 72 * hour), status: 'FINISHED',
    home_name: 'Fenerbahçe', home_short: 'Fenerbahçe',
    away_name: 'Galatasaray', away_short: 'Galatasaray',
    home_score: 2, away_score: 1,
  }),
  row({
    id: 'm6', external_id: '6', competition: 'UECL', kickoff: iso(now - 48 * hour), status: 'FINISHED',
    home_name: 'Trabzonspor', home_short: 'Trabzonspor',
    away_name: 'KuPS', away_short: 'KuPS',
    home_score: 2, away_score: 0,
  }),
  row({
    id: 'm5', external_id: '5', competition: 'CL', kickoff: iso(now - 2 * hour), status: 'POSTPONED',
    home_name: 'Galatasaray', home_short: 'Galatasaray',
    away_name: 'Beşiktaş', away_short: 'Beşiktaş',
    home_score: null, away_score: null,
  }),
  row({
    id: 'm3', external_id: '3', competition: 'EL', kickoff: iso(now - 1 * hour), status: 'IN_PLAY', minute: 55,
    home_name: 'Beşiktaş', home_short: 'Beşiktaş',
    away_name: 'Marseille', away_short: 'Marseille',
    home_score: 1, away_score: 0,
  }),
  row({
    id: 'm4', external_id: '4', competition: 'EL', kickoff: iso(now + 24 * hour), status: 'TIMED',
    home_name: 'Fenerbahçe', home_short: 'Fenerbahçe',
    away_name: 'Lyon', away_short: 'Lyon',
    home_score: null, away_score: null,
  }),
]

const mainPredictions = [
  { player_id: 'p1', match_id: 'm1', outcome: 'H' }, // yanlış
  { player_id: 'p1', match_id: 'm2', outcome: 'H' }, // doğru (derbi)
  { player_id: 'p1', match_id: 'm6', outcome: 'H' }, // doğru
  { player_id: 'p1', match_id: 'm3', outcome: 'H' }, // canlı → görünüyor
  { player_id: 'p1', match_id: 'm4', outcome: 'H' }, // gelecek → mühürlü
  { player_id: 'p2', match_id: 'm1', outcome: 'A' }, // doğru
  { player_id: 'p2', match_id: 'm2', outcome: 'D' }, // yanlış
  { player_id: 'p2', match_id: 'm3', outcome: 'D' }, // canlı
  { player_id: 'p2', match_id: 'm5', outcome: 'A' }, // ertelenmiş → mühürlü kalmalı
  { player_id: 'p3', match_id: 'm1', outcome: 'A' }, // pasif → hiçbir yerde görünmemeli
  { player_id: 'p4', match_id: 'm1', outcome: 'A' }, // doğru
  { player_id: 'p4', match_id: 'm2', outcome: 'H' }, // doğru (derbi)
  { player_id: 'p4', match_id: 'm6', outcome: 'D' }, // yanlış
]

function mainSupabase() {
  return createMemorySupabase({
    players: mainPlayers,
    matches: mainMatches,
    predictions: mainPredictions,
    sync_state: [{
      id: 1,
      last_attempt_at: iso(now - hour),
      last_success_at: iso(now - hour),
      last_error: null,
      matches_seen: 6,
      updated_at: iso(now - hour),
    }],
  })
}

let payload
suite.test('senaryo payload\'ı kuruluyor', async () => {
  payload = await buildLeaguePayload(mainSupabase())
  assert.ok(payload, 'payload üretildi')
})

suite.test('mühür: gelecek TIMED maçta tahmin yalnız "kim" olarak görünür', () => {
  const m4 = payload.matches.find(m => m.id === 'm4')
  assert.equal(m4.predictionsVisible, false)
  assert.equal(m4.isStarted, false)
  assert.equal(m4.statusGroup, 'upcoming')
  assert.equal(m4.predictionCount, 1, 'tahmin sayısı herkese açık')
  assert.equal(m4.predictions.length, 1)
  const sealed = m4.predictions[0]
  assert.equal(sealed.playerId, 'p1')
  assert.equal(sealed.name, 'Ogün')
  assert.equal(sealed.initials, 'O')
  assert.equal(sealed.color, '#b8f34a')
  assert.deepEqual(
    Object.keys(sealed).sort(),
    ['color', 'initials', 'name', 'playerId'],
    'mühürlü satırda outcome/label/points/correct OLMAMALI',
  )
  assert.equal(m4.score, null)
})

suite.test('mühür: başlamış IN_PLAY maçta tahmin açılır, puan bitene kadar null', () => {
  const m3 = payload.matches.find(m => m.id === 'm3')
  assert.equal(m3.predictionsVisible, true)
  assert.equal(m3.isLive, true)
  assert.equal(m3.minute, 55)
  assert.deepEqual(m3.score, { home: 1, away: 0 })
  const byId = Object.fromEntries(m3.predictions.map(p => [p.playerId, p]))
  assert.equal(byId.p1.outcome, 'H')
  assert.equal(byId.p1.label, 'Beşiktaş yener')
  assert.equal(byId.p1.points, null, 'canlı maçta puan null')
  assert.equal(byId.p1.correct, null)
  assert.equal(byId.p2.outcome, 'D')
  assert.equal(byId.p2.label, 'Beraberlik')
  assert.equal(byId.p2.points, null)
})

suite.test('mühür: geçmişte ertelenen maç SEALED kalır (kickoff geçmiş olsa bile)', () => {
  const m5 = payload.matches.find(m => m.id === 'm5')
  assert.equal(m5.isStarted, true, 'kickoff geçti')
  assert.equal(m5.statusGroup, 'inactive')
  assert.equal(m5.predictionsVisible, false, 'POSTPONED oynanana kadar mühürlü')
  assert.equal(m5.predictionCount, 1)
  const sealed = m5.predictions[0]
  assert.equal(sealed.playerId, 'p2')
  assert.equal(sealed.outcome, undefined)
  assert.equal(sealed.label, undefined)
  assert.equal(sealed.points, undefined)
})

suite.test('bitmiş maçta puan/etiket/doğruluk dolu gelir', () => {
  const m1 = payload.matches.find(m => m.id === 'm1')
  assert.equal(m1.isFinished, true)
  assert.deepEqual(m1.score, { home: 1, away: 4 })
  // puan desc → isim asc: Ali(1), Mert(1), Ogün(0)
  assert.deepEqual(m1.predictions.map(p => p.playerId), ['p4', 'p2', 'p1'])
  const ali = m1.predictions[0]
  assert.equal(ali.outcome, 'A')
  assert.equal(ali.label, 'Barcelona yener')
  assert.equal(ali.points, 1)
  assert.equal(ali.correct, true)
  const ogun = m1.predictions.find(p => p.playerId === 'p1')
  assert.equal(ogun.points, 0)
  assert.equal(ogun.correct, false)
  assert.equal(ogun.label, 'Galatasaray yener')
})

suite.test('pasif oyuncu her yerden dışlanır', () => {
  assert.equal(payload.meta.counts.players, 3, 'aktif oyuncu sayısı')
  assert.deepEqual(payload.players.map(p => p.id).sort(), ['p1', 'p2', 'p4'])
  assert.ok(!payload.standings.some(s => s.id === 'p3'), 'puan durumunda pasif yok')
  const m1 = payload.matches.find(m => m.id === 'm1')
  assert.ok(!m1.predictions.some(p => p.playerId === 'p3'), 'maç tahminlerinde pasif yok')
  assert.equal(m1.predictionCount, 3, 'pasif tahmini sayıya girmez')
})

suite.test('puan durumu matematik: points/played/missed/correctOutcomes/accuracy', () => {
  const st = Object.fromEntries(payload.standings.map(r => [r.id, r]))

  // Ogün: m1 yanlış, m2 doğru, m6 doğru
  assert.equal(st.p1.points, 2)
  assert.equal(st.p1.played, 3)
  assert.equal(st.p1.missed, 0)
  assert.equal(st.p1.correctOutcomes, 2)
  assert.equal(st.p1.accuracy, 67, 'round(2/3*100) = 67')
  assert.deepEqual(st.p1.form, [0, 1, 1], 'kronolojik son değerler')

  // Ali: m1 doğru, m2 doğru, m6 yanlış
  assert.equal(st.p4.points, 2)
  assert.equal(st.p4.correctOutcomes, 2)
  assert.deepEqual(st.p4.form, [1, 1, 0])

  // Mert: m1 doğru, m2 yanlış, m6 kaçırdı
  assert.equal(st.p2.points, 1)
  assert.equal(st.p2.played, 2)
  assert.equal(st.p2.missed, 1)
  assert.equal(st.p2.accuracy, 50)
  assert.deepEqual(st.p2.form, [1, 0])
})

suite.test('teamCorrect: derbi doğru tahmini FB ve GS\'yi birlikte artırır', () => {
  const st = Object.fromEntries(payload.standings.map(r => [r.id, r]))
  // Ogün: m2 derbi (FB-GS) doğru → FB+1 GS+1; m6 (TS) doğru → TS+1
  assert.deepEqual(st.p1.teamCorrect, { FB: 1, GS: 1, BJK: 0, TS: 1 })
  // Ali: m1 (GS tarafı) doğru → GS+1; m2 derbi doğru → FB+1 GS+1; m6 yanlış
  assert.deepEqual(st.p4.teamCorrect, { FB: 1, GS: 2, BJK: 0, TS: 0 })
  // Mert: yalnız m1 (GS tarafı) doğru
  assert.deepEqual(st.p2.teamCorrect, { FB: 0, GS: 1, BJK: 0, TS: 0 })
})

suite.test('sıralama: puan ↓, doğru ↓, isim ↑ (tr) + rank/behind/leader', () => {
  // Ali 2P/2C, Ogün 2P/2C → isim: Ali < Ogün; Mert 1P
  assert.deepEqual(payload.standings.map(r => r.id), ['p4', 'p1', 'p2'])
  assert.deepEqual(payload.standings.map(r => r.rank), [1, 2, 3])
  assert.deepEqual(payload.standings.map(r => r.behind), [0, 0, 1])
  assert.deepEqual(payload.meta.leader, { name: 'Ali', points: 2 })
})

suite.test('meta: sayılar, nextMatch, lastFinished, takım formu', () => {
  const meta = payload.meta
  assert.deepEqual(meta.counts, { players: 3, matches: 6, finished: 3, live: 1, upcoming: 1 })
  assert.equal(meta.sync.lastSuccessAt !== null, true)
  assert.equal(meta.sync.matchesSeen, 6)

  assert.equal(meta.nextMatch.id, 'm4')
  assert.equal(meta.nextMatch.competitionCode, 'EL')
  assert.equal(meta.nextMatch.homeShort, 'Fenerbahçe')
  assert.equal(meta.nextMatch.score, null)
  assert.equal(meta.nextMatch.status, 'TIMED')

  assert.equal(meta.lastFinished.id, 'm6')
  assert.deepEqual(meta.lastFinished.score, { home: 2, away: 0 })

  // Takım formu: GS iki mağlubiyet (m1, m2), FB/TS galibiyet
  const m1 = payload.matches.find(m => m.id === 'm1')
  assert.deepEqual(m1.home.form, ['M', 'M'], 'GS formu: M,M')
  const m2 = payload.matches.find(m => m.id === 'm2')
  assert.deepEqual(m2.home.form, ['G'], 'FB formu: G')
  assert.deepEqual(m2.away.form, ['M', 'M'], 'GS formu (m2 away): M,M')
})

suite.test('form son 5 tahminle sınırlı; takım formu son 5 maçla sınırlı', async () => {
  const t0 = Date.now()
  const players = [{ id: 'z1', name: 'Zeynep', color: '#b8f34a', is_active: true }]
  const matches = []
  const predictions = []
  const outcomes = ['W', 'W', 'C', 'C', 'C', 'W', 'C'] // 7 bitmiş maç, hepsi ev sahibi 2-0
  outcomes.forEach((pick, i) => {
    const id = `f${i + 1}`
    matches.push(row({
      id, external_id: id, competition: 'CL', kickoff: iso(t0 - (8 - i) * hour), status: 'FINISHED',
      home_name: 'Galatasaray', home_short: 'Galatasaray',
      away_name: `Rakip ${i + 1}`, away_short: `R${i + 1}`,
      home_score: 2, away_score: 0,
    }))
    predictions.push({ player_id: 'z1', match_id: id, outcome: pick === 'C' ? 'H' : 'A' })
  })
  const sup = createMemorySupabase({ players, matches, predictions })
  const p = await buildLeaguePayload(sup)
  const z = p.standings[0]
  assert.equal(z.played, 7)
  assert.equal(z.points, 4, '4 doğru (C ×4), 3 yanlış (W ×3)')
  assert.deepEqual(z.form, [1, 1, 1, 0, 1], 'son 5 tahmin değeri')
  assert.equal(z.accuracy, 57, 'round(4/7*100) = 57')
  const first = p.matches[0]
  assert.deepEqual(first.home.form, ['G', 'G', 'G', 'G', 'G'], 'takım formu son 5 galibiyet')
})

suite.test('meta.sync.lastSuccessAgeMinutes: taze → küçük değer, başarı yoksa null', async () => {
  assert.equal(payload.meta.sync.lastSuccessAgeMinutes, 60, 'ana senaryo: 1 saat önceki başarı → 60')

  const freshSup = createMemorySupabase({
    sync_state: [{
      id: 1,
      last_attempt_at: iso(Date.now()),
      last_success_at: iso(Date.now()),
      last_error: null,
      matches_seen: 0,
      updated_at: iso(Date.now()),
    }],
  })
  const fresh = await buildLeaguePayload(freshSup)
  assert.equal(fresh.meta.sync.lastSuccessAgeMinutes, 0, 'taze başarı → 0')

  const never = await buildLeaguePayload(createMemorySupabase())
  assert.equal(never.meta.sync.lastSuccessAgeMinutes, null, 'last_success yok → null')
})

// --- buildAdminPayload ---

suite.test('buildAdminPayload: kilit bayrakları + "pid:mid" tahmin haritası', async () => {
  const admin = await buildAdminPayload(mainSupabase())
  const locked = Object.fromEntries(admin.matches.map(m => [m.id, m.locked]))
  assert.equal(locked.m1, true, 'bitmiş kilitli')
  assert.equal(locked.m3, true, 'canlı kilitli')
  assert.equal(locked.m5, true, 'ertelenen kilitli')
  assert.equal(locked.m4, false, 'gelecek maç açık')

  assert.equal(admin.predictions['p1:m4'], 'H')
  assert.equal(admin.predictions['p2:m5'], 'A')
  assert.equal(admin.predictions['p3:m1'], 'A', 'admin pasif oyuncunun tahminini de görür')

  const p3 = admin.players.find(p => p.id === 'p3')
  assert.equal(p3.isActive, false, 'pasif oyuncu admin listesinde işaretli')
  assert.deepEqual(admin.scoring, { label: 'Doğru sonuç 1 puan', status: 'provisional', correctOutcome: 1 })
  assert.equal(admin.sync.id, 1)
})

await runIfMain(suite)
export { suite }
