// C · lib/league.js testleri — mühür kuralları, puan durumu, meta, admin payload.

import assert from 'node:assert/strict'
import { buildAdminPayload, buildLeaguePayload, seasonLabel } from '../../lib/league.js'
import { seasonYear } from '../../lib/espn.js'
import { GET as leagueGET } from '../../api/league.js'
import { createMemorySupabase, createSuite, hour, iso, runIfMain } from './helpers.mjs'

const suite = createSuite('C · lib/league.js')

const now = Date.now()
const SY = seasonYear(new Date(now))
const labelOf = y => seasonLabel(y)

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
  // Dondurulmuş flag'ler (P5): tohumlar aktif (lig, sezon) kapsamındadır;
  // istisnai testler ...o ile override eder.
  league: 'EU',
  season_year: SY,
  ...o,
})

const mainPlayers = [
  // p1'e avatar tohumu (#17): payload'da avatarUrl taşınımını ölçer; diğerleri
  // kolonsuz → `?? null` yolunu (deploy sırası güvenliği) test eder.
  { id: 'p1', name: 'Ogün', color: '#b8f34a', is_active: true, avatar_url: 'https://x.supabase.co/storage/v1/object/public/avatars/av-p1-1.jpg' },
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
    home_crest: 'https://a.espncdn.com/i/teamlogos/soccer/500/2393.png',
    away_name: 'Lyon', away_short: 'Lyon',
    away_crest: 'https://a.espncdn.com/i/teamlogos/soccer/500/194.png',
    home_score: null, away_score: null,
  }),
]

const mainPredictions = [
  { player_id: 'p1', match_id: 'm1', outcome: 'H' }, // yanlış
  { player_id: 'p1', match_id: 'm2', outcome: 'H' }, // doğru (derbi)
  { player_id: 'p1', match_id: 'm6', outcome: 'H' }, // doğru
  { player_id: 'p1', match_id: 'm3', outcome: 'H' }, // canlı → görünüyor
  // U9: gelecek (mühürlü) maç — damgalar taşınır, outcome taşımaz;
  // updated_at > created_at → akışta "güncelledi" ayrımı için senaryo.
  {
    player_id: 'p1', match_id: 'm4', outcome: 'H',
    created_at: iso(now - 30 * hour), updated_at: iso(now - 10 * hour),
  },
  { player_id: 'p2', match_id: 'm1', outcome: 'A' }, // doğru
  { player_id: 'p2', match_id: 'm2', outcome: 'D' }, // yanlış
  { player_id: 'p2', match_id: 'm3', outcome: 'D' }, // canlı
  { player_id: 'p2', match_id: 'm5', outcome: 'A' }, // ertelenmiş → mühürlü kalmalı
  { player_id: 'p3', match_id: 'm1', outcome: 'A' }, // pasif → hiçbir yerde görünmemeli
  // U9: bitmiş maç — created_at == updated_at → akışta "girdi" senaryosu.
  {
    player_id: 'p4', match_id: 'm1', outcome: 'A',
    created_at: iso(now - 90 * hour), updated_at: iso(now - 90 * hour),
  },
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
  // U9: tahmin satırı damga TAŞIMAZ (yalnız meta.recentPredictions'ta; payload
  // diyeti). Sealed satırda outcome/label/points/correct HÂLÂ YOK.
  assert.deepEqual(
    Object.keys(sealed).sort(),
    ['avatarUrl', 'color', 'initials', 'name', 'playerId'],
    'mühürlü satırda outcome/label/points/correct/enteredAt OLMAMALI',
  )
  assert.equal(sealed.outcome, undefined, 'outcome HÂLÂ sızmamalı')
  assert.equal(sealed.enteredAt, undefined, 'damga satırdan taşınmaz (#20 diyet)')
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

suite.test('recentPredictions (U9): akış olayları — outcome yok, mühürlü maç dahil, updated desc', () => {
  const recent = payload.recentPredictions
  assert.ok(Array.isArray(recent) && recent.length >= 2, 'en az iki damgalı olay')
  for (const r of recent) {
    assert.deepEqual(
      Object.keys(r).sort(),
      ['enteredAt', 'matchId', 'playerId', 'updatedAt'],
      'olay yalnız kim+maç+damga taşır',
    )
  }
  // En yeni olay: p1'in MÜHÜRLÜ (gelecek) m4 tahmininin güncellemesi —
  // outcome olayda zaten yok; akış "güncelledi" olarak gösterebilir.
  assert.equal(recent[0].playerId, 'p1')
  assert.equal(recent[0].matchId, 'm4')
  assert.equal(recent[0].enteredAt, iso(now - 30 * hour))
  assert.equal(recent[0].updatedAt, iso(now - 10 * hour))
  // Sıra updated_at desc.
  const withTs = recent.filter(r => r.updatedAt)
  for (let i = 1; i < withTs.length; i++) {
    assert.ok(
      Date.parse(withTs[i - 1].updatedAt) >= Date.parse(withTs[i].updatedAt),
      'olaylar updated_at desc',
    )
  }
  // p4:m1 girişi (created==updated → "girdi" olayı).
  const ali = recent.find(r => r.playerId === 'p4' && r.matchId === 'm1')
  assert.equal(ali.enteredAt, iso(now - 90 * hour))
  assert.equal(ali.updatedAt, iso(now - 90 * hour))
})

suite.test('pasif oyuncu her yerden dışlanır', () => {
  assert.equal(payload.meta.counts.players, 3, 'aktif oyuncu sayısı')
  assert.deepEqual(payload.players.map(p => p.id).sort(), ['p1', 'p2', 'p4'])
  assert.ok(!payload.standings.some(s => s.id === 'p3'), 'puan durumunda pasif yok')
  const m1 = payload.matches.find(m => m.id === 'm1')
  assert.ok(!m1.predictions.some(p => p.playerId === 'p3'), 'maç tahminlerinde pasif yok')
  assert.equal(m1.predictionCount, 3, 'pasif tahmini sayıya girmez')
})

suite.test('avatarUrl: players/standings/tahmin satırlarında taşınır (null dahil)', () => {
  const avatar1 = mainPlayers[0].avatar_url
  const playersById = Object.fromEntries(payload.players.map(p => [p.id, p]))
  assert.equal(playersById.p1.avatarUrl, avatar1, 'players[] avatar URL taşıyor')
  assert.equal(playersById.p2.avatarUrl, null, 'avataru olmayan → null (kolon yoksa patlamaz)')

  const st = Object.fromEntries(payload.standings.map(r => [r.id, r]))
  assert.equal(st.p1.avatarUrl, avatar1, 'standings satırı avatar URL taşıyor')
  assert.equal(st.p2.avatarUrl, null)

  const m1 = payload.matches.find(m => m.id === 'm1')
  const ogun = m1.predictions.find(p => p.playerId === 'p1')
  assert.equal(ogun.avatarUrl, avatar1, 'maç tahmin satırı avatar URL taşıyor')
  const mert = m1.predictions.find(p => p.playerId === 'p2')
  assert.equal(mert.avatarUrl, null)

  // mühürlü gelecek maçta da kim satırı avatarUrl ile gelir
  const m4 = payload.matches.find(m => m.id === 'm4')
  assert.equal(m4.predictions[0].avatarUrl, avatar1)
})

suite.test('puan durumu matematik: points/played/correctOutcomes/accuracy', () => {
  const st = Object.fromEntries(payload.standings.map(r => [r.id, r]))

  // Ogün: m1 yanlış, m2 doğru, m6 doğru
  assert.equal(st.p1.points, 2)
  assert.equal(st.p1.played, 3)
  assert.equal(st.p1.correctOutcomes, 2)
  assert.equal(st.p1.accuracy, 67, 'round(2/3*100) = 67')

  // Ali: m1 doğru, m2 doğru, m6 yanlış
  assert.equal(st.p4.points, 2)
  assert.equal(st.p4.correctOutcomes, 2)

  // Mert: m1 doğru, m2 yanlış, m6 kaçırdı (kaçırma artık played farkından okunur)
  assert.equal(st.p2.points, 1)
  assert.equal(st.p2.played, 2)
  assert.equal(st.p2.accuracy, 50)
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

suite.test('sıralama: puan ↓, doğru ↓, isim ↑ (tr) + rank/leader', () => {
  // Ali 2P/2C, Ogün 2P/2C → isim: Ali < Ogün; Mert 1P
  assert.deepEqual(payload.standings.map(r => r.id), ['p4', 'p1', 'p2'])
  assert.deepEqual(payload.standings.map(r => r.rank), [1, 2, 3])
  assert.deepEqual(payload.meta.leader, { name: 'Ali', points: 2 })
})

suite.test('meta: sayılar, senkron, takım formu', () => {
  const meta = payload.meta
  assert.deepEqual(meta.counts, { players: 3, matches: 6, finished: 3, live: 1, upcoming: 1 })
  assert.equal(meta.sync.lastSuccessAt !== null, true)

  // Takım formu: GS iki mağlubiyet (m1, m2), FB/TS galibiyet
  const m1 = payload.matches.find(m => m.id === 'm1')
  assert.deepEqual(m1.home.form, ['M', 'M'], 'GS formu: M,M')
  const m2 = payload.matches.find(m => m.id === 'm2')
  assert.deepEqual(m2.home.form, ['G'], 'FB formu: G')
  assert.deepEqual(m2.away.form, ['M', 'M'], 'GS formu (m2 away): M,M')
})

suite.test('takım formu son 5 maçla sınırlı', async () => {
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

suite.test('buildAdminPayload (U4): uzun takım adları + crest + competitions listesi', async () => {
  const admin = await buildAdminPayload(mainSupabase())
  const m4 = admin.matches.find(m => m.id === 'm4')
  assert.equal(m4.homeShort, 'Fenerbahçe', 'homeShort korunur')
  assert.equal(m4.awayShort, 'Lyon', 'awayShort korunur')
  assert.equal(m4.homeName, 'Fenerbahçe', 'uzun ev sahibi adı')
  assert.equal(m4.awayName, 'Lyon', 'uzun deplasman adı')
  assert.equal(m4.homeCrest, 'https://a.espncdn.com/i/teamlogos/soccer/500/2393.png', 'ev crest URL')
  assert.equal(m4.awayCrest, 'https://a.espncdn.com/i/teamlogos/soccer/500/194.png', 'deplasman crest URL')

  const m1 = admin.matches.find(m => m.id === 'm1')
  assert.equal(m1.homeName, 'Galatasaray')
  assert.equal(m1.awayName, 'Barcelona')
  assert.equal(m1.homeCrest, null, 'crest kolonu yoksa/null → null (deploy sırası güvenli)')
  assert.equal(m1.awayCrest, null)

  // Turnuva listesi public payload'daki desenle aynı: kod + uzun ad.
  assert.deepEqual(admin.competitions, [
    { code: 'CL', name: 'UEFA Şampiyonlar Ligi' },
    { code: 'EL', name: 'UEFA Avrupa Ligi' },
    { code: 'UECL', name: 'UEFA Konferans Ligi' },
  ])
})

// --- Sezon/lig meta + izolasyon (v6 P5/P6/P2-bonus) ---

suite.test('meta.season/seasons/leagues: seçili ligin sezonları desc sıralanır', async () => {
  const supM = createMemorySupabase({
    players: [{ id: 'q1', name: 'Ada', color: '#b8f34a', is_active: true }],
    matches: [
      row({
        id: 's-new', external_id: 'n1', competition: 'CL', kickoff: iso(now - 24 * hour), status: 'FINISHED',
        home_name: 'Galatasaray', home_short: 'Galatasaray',
        away_name: 'Rakip', away_short: 'Rakip',
        home_score: 2, away_score: 0,
      }),
      row({
        id: 's-old', external_id: 'o1', competition: 'CL',
        kickoff: iso(Date.parse(`${SY}-03-15T18:45:00Z`)), status: 'FINISHED',
        home_name: 'Fenerbahçe', home_short: 'Fenerbahçe',
        away_name: 'Eski Rakip', away_short: 'Eski Rakip',
        home_score: 1, away_score: 0, season_year: SY - 1,
      }),
    ],
  })
  const p = await buildLeaguePayload(supM)
  assert.deepEqual(p.meta.season, { year: SY, label: labelOf(SY) }, 'varsayılan sezon = aktif sezon')
  assert.deepEqual(p.meta.seasons, [
    { year: SY, label: labelOf(SY) },
    { year: SY - 1, label: labelOf(SY - 1) },
  ], 'sezonlar desc; seçili ligin tüm sezonları')
  // #21: iki aktif lig — EU ilk (varsayılan), TSL ikinci.
  assert.deepEqual(p.meta.leagues, [
    { code: 'EU', name: 'Avrupa', active: true },
    { code: 'TSL', name: 'Süper Lig', active: true },
  ], 'meta.leagues aktif kayıtlar')
  assert.deepEqual(p.competitions, [
    { code: 'CL', name: 'UEFA Şampiyonlar Ligi' },
    { code: 'EL', name: 'UEFA Avrupa Ligi' },
    { code: 'UECL', name: 'UEFA Konferans Ligi' },
  ], 'EU competitions listesi lig kapsamında')
  assert.deepEqual(p.matches.map(m => m.id), ['s-new'], 'varsayılan payload yalnız aktif sezonu taşır')

  const oldP = await buildLeaguePayload(supM, { seasonYear: SY - 1 })
  assert.deepEqual(oldP.matches.map(m => m.id), ['s-old'], 'seçilen sezon izole')
  assert.deepEqual(oldP.meta.season, { year: SY - 1, label: labelOf(SY - 1) })
})

suite.test('sezon izolasyonu: standings yalnız o sezonu sayar; bonuslar sezonluk (P2-bonus)', async () => {
  const supS = createMemorySupabase({
    players: [
      { id: 'q1', name: 'Ada', color: '#b8f34a', is_active: true },
      { id: 'q2', name: 'Bora', color: '#5ce1e6', is_active: true },
    ],
    matches: [
      row({
        id: 'm-old', external_id: 'o2', competition: 'CL',
        kickoff: iso(Date.parse(`${SY - 1}-11-10T18:45:00Z`)), status: 'FINISHED',
        home_name: 'Galatasaray', home_short: 'Galatasaray',
        away_name: 'Rakip', away_short: 'Rakip',
        home_score: 2, away_score: 0, season_year: SY - 1,
      }),
      row({
        id: 'm-new', external_id: 'n2', competition: 'CL', kickoff: iso(now - 24 * hour), status: 'FINISHED',
        home_name: 'Beşiktaş', home_short: 'Beşiktaş',
        away_name: 'Rakip', away_short: 'Rakip',
        home_score: 0, away_score: 1,
      }),
    ],
    predictions: [
      { player_id: 'q1', match_id: 'm-old', outcome: 'H' }, // eski sezonda doğru
      { player_id: 'q2', match_id: 'm-old', outcome: 'A' }, // eski sezonda yanlış
      { player_id: 'q1', match_id: 'm-new', outcome: 'H' }, // yeni sezonda yanlış
      { player_id: 'q2', match_id: 'm-new', outcome: 'A' }, // yeni sezonda doğru
    ],
    app_config: [
      { key: 'scoring', value: { label: 'Doğru sonuç 1 puan', status: 'provisional', correctOutcome: 1 } },
      { key: `bonus:${SY - 1}`, value: { q1: 2 } },
      { key: `bonus:${SY}`, value: { q2: 5 } },
    ],
  })

  const oldP = await buildLeaguePayload(supS, { seasonYear: SY - 1 })
  assert.deepEqual(oldP.matches.map(m => m.id), ['m-old'])
  const oldSt = Object.fromEntries(oldP.standings.map(r => [r.id, r]))
  assert.equal(oldSt.q1.points, 3, 'eski sezon: 1 doğru + o sezonun bonusu (2)')
  assert.equal(oldSt.q1.played, 1)
  assert.equal(oldSt.q2.points, 0, 'eski sezonda doğru yok; yeni sezon bonusu SIZMAZ')

  const newP = await buildLeaguePayload(supS) // varsayılan: aktif sezon
  assert.deepEqual(newP.matches.map(m => m.id), ['m-new'])
  const newSt = Object.fromEntries(newP.standings.map(r => [r.id, r]))
  assert.equal(newSt.q2.points, 6, 'yeni sezon: 1 doğru + o sezonun bonusu (5)')
  assert.equal(newSt.q1.points, 0, 'eski sezon doğrusu yeni sezona SIZMAZ')
  assert.equal(newP.players.find(pl => pl.id === 'q2').name, 'Bora', 'players listesi sezonluk veri taşır')
})

suite.test('bilinmeyen lig kodu hata fırlatır (api 400 kaynağı)', async () => {
  await assert.rejects(
    () => buildLeaguePayload(createMemorySupabase(), { league: 'XX' }),
    /Bilinmeyen lig/,
  )
})

// --- #21 Süper Lig: lig izolasyonu + lig bazlı bonus ---

const tslRow = o => row({ ...o, league: 'TSL', competition: 'TSL' })

suite.test('#21 TSL: standings yalnız TSL maçlarından; EU tablosu etkilenmez', async () => {
  const supT = createMemorySupabase({
    players: [
      { id: 'q1', name: 'Ada', color: '#b8f34a', is_active: true },
      { id: 'q2', name: 'Bora', color: '#5ce1e6', is_active: true },
    ],
    matches: [
      row({
        id: 'eu1', external_id: 'e1', competition: 'CL', kickoff: iso(now - 96 * hour), status: 'FINISHED',
        home_name: 'Galatasaray', home_short: 'Galatasaray',
        away_name: 'Barcelona', away_short: 'Barcelona',
        home_score: 1, away_score: 4,
      }),
      tslRow({
        id: 't1', external_id: 't1', kickoff: iso(now - 48 * hour), status: 'FINISHED',
        home_name: 'Galatasaray', home_short: 'Galatasaray',
        away_name: 'Samsunspor', away_short: 'Samsunspor',
        home_score: 2, away_score: 0, matchday: null,
      }),
      tslRow({
        id: 't2', external_id: 't2', kickoff: iso(now + 24 * hour), status: 'TIMED',
        home_name: 'Başakşehir', home_short: 'Başakşehir',
        away_name: 'Fenerbahçe', away_short: 'Fenerbahçe',
        home_score: null, away_score: null,
      }),
    ],
    predictions: [
      { player_id: 'q1', match_id: 'eu1', outcome: 'H' }, // EU'da yanlış
      { player_id: 'q1', match_id: 't1', outcome: 'H' }, // TSL'de doğru
      { player_id: 'q2', match_id: 'eu1', outcome: 'A' }, // EU'da doğru
    ],
  })

  const tsl = await buildLeaguePayload(supT, { league: 'TSL' })
  assert.deepEqual(tsl.matches.map(m => m.id).sort(), ['t1', 't2'], 'TSL payload yalnız TSL maçları')
  assert.equal(tsl.meta.counts.matches, 2)
  assert.equal(tsl.meta.season.year, SY, 'TSL de aynı sezon takvimini kullanır')
  assert.deepEqual(tsl.competitions, [{ code: 'TSL', name: 'Süper Lig' }], 'competitions lig kapsamına iner')
  const st = Object.fromEntries(tsl.standings.map(r => [r.id, r]))
  assert.equal(st.q1.points, 1, 'TSL doğrusu TSL tablosunda')
  assert.equal(st.q1.played, 1)
  assert.equal(st.q2.points, 0, 'EU doğrusu TSL puanına SIZMAZ')
  assert.equal(st.q2.played, 0)
  assert.deepEqual(st.q1.teamCorrect, { FB: 0, GS: 1, BJK: 0, TS: 0 }, 'teamCorrect TSL maçından')

  // Aynı veriden EU payload'ı: TSL maçları/sonuçları hiç görünmez.
  const eu = await buildLeaguePayload(supT, { league: 'EU' })
  assert.deepEqual(eu.matches.map(m => m.id), ['eu1'], 'EU payload yalnız EU maçları')
  assert.deepEqual(eu.competitions.map(c => c.code), ['CL', 'EL', 'UECL'], 'EU competitions listesi')
  const est = Object.fromEntries(eu.standings.map(r => [r.id, r]))
  assert.equal(est.q2.points, 1, 'EU doğrusu EU tablosunda')
  assert.equal(est.q1.points, 0, 'TSL doğrusu EU puanına SIZMAZ')
  assert.deepEqual(est.q1.teamCorrect, { FB: 0, GS: 0, BJK: 0, TS: 0 }, 'TSL doğrusu EU teamCorrect\'e sızmaz')

  // Admin payload da lig kapsamını izler (bootstrap ?league= kaynağı).
  const admin = await buildAdminPayload(supT, { league: 'TSL' })
  assert.deepEqual(admin.matches.map(m => m.id).sort(), ['t1', 't2'], 'admin editörü TSL kapsamında')
  assert.deepEqual(admin.competitions, [{ code: 'TSL', name: 'Süper Lig' }])
})

suite.test('#21 T3 review: recentPredictions lig kapsamıyla sınırlı — TSL girişi EU akışını iter mi', async () => {
  const supF = createMemorySupabase({
    players: [
      { id: 'q1', name: 'Ada', color: '#b8f34a', is_active: true },
      { id: 'q2', name: 'Bora', color: '#5ce1e6', is_active: true },
    ],
    matches: [
      row({
        id: 'eu1', external_id: 'e1', competition: 'CL', kickoff: iso(now - 96 * hour), status: 'FINISHED',
        home_name: 'Galatasaray', home_short: 'Galatasaray',
        away_name: 'Barcelona', away_short: 'Barcelona',
        home_score: 1, away_score: 4,
      }),
      tslRow({
        id: 't1', external_id: 't1', kickoff: iso(now - 48 * hour), status: 'FINISHED',
        home_name: 'Galatasaray', home_short: 'Galatasaray',
        away_name: 'Samsunspor', away_short: 'Samsunspor',
        home_score: 2, away_score: 0, matchday: null,
      }),
    ],
    predictions: [
      // EU girişi ESKİ, TSL girişi YENİ — global top-30'da TSL başı çekerdi.
      { player_id: 'q1', match_id: 'eu1', outcome: 'H',
        created_at: iso(now - 90 * hour), updated_at: iso(now - 90 * hour) },
      { player_id: 'q1', match_id: 't1', outcome: 'H',
        created_at: iso(now - 2 * hour), updated_at: iso(now - 2 * hour) },
    ],
  })

  const eu = await buildLeaguePayload(supF, { league: 'EU' })
  assert.deepEqual(eu.recentPredictions.map(r => r.matchId), ['eu1'], 'EU akışı yalnız EU maçı olayı taşır')

  const tsl = await buildLeaguePayload(supF, { league: 'TSL' })
  assert.deepEqual(tsl.recentPredictions.map(r => r.matchId), ['t1'], 'TSL akışı yalnız TSL maçı olayı taşır')
})

suite.test('maçsız geçerli sezon → boş payload, standings sıfırlı kalır', async () => {
  const p = await buildLeaguePayload(mainSupabase(), { seasonYear: SY + 4 })
  assert.equal(p.matches.length, 0)
  assert.equal(p.meta.counts.matches, 0)
  assert.equal(p.meta.season.year, SY + 4)
  assert.equal(p.standings.length, 3)
  assert.ok(p.standings.every(r => r.points === 0 && r.played === 0))
  assert.deepEqual(p.meta.seasons.map(s => s.year), [SY], 'sezon listesi seçili ligin mevcut sezonları')
})

suite.test('#21 bonus: lig bazlı anahtar tercih edilir; eski biçim yalnız EU yedeği', async () => {
  const seed = extra => createMemorySupabase({
    players: [{ id: 'q1', name: 'Ada', color: '#b8f34a', is_active: true }],
    matches: [row({
      id: 'eu1', external_id: 'e1', competition: 'CL', kickoff: iso(now - 48 * hour), status: 'FINISHED',
      home_name: 'Galatasaray', home_short: 'Galatasaray',
      away_name: 'Barcelona', away_short: 'Barcelona',
      home_score: 2, away_score: 0,
    })], // tahmin yok → standings puanı = yalnız bonus
    app_config: [
      { key: 'scoring', value: { label: 'x', status: 'provisional', correctOutcome: 1 } },
      ...extra,
    ],
  })

  // 1) Her lig kendi lig bazlı anahtarını okur; çapraz sıçrama yok.
  const supB = seed([
    { key: `bonus:EU:${SY}`, value: { q1: 2 } },
    { key: `bonus:TSL:${SY}`, value: { q1: 5 } },
  ])
  const eu = await buildLeaguePayload(supB, { league: 'EU' })
  assert.equal(eu.standings.find(r => r.id === 'q1').points, 2, 'EU bonusu bonus:EU:<sezon>')
  const tsl = await buildLeaguePayload(supB, { league: 'TSL' })
  assert.equal(tsl.standings.find(r => r.id === 'q1').points, 5, 'TSL bonusu bonus:TSL:<sezon>')

  // 2) Göç penceresi: bonus:EU yoksa EU eski bonus:<sezon>'a düşer; TSL DÜŞMEZ
  //    (eski anahtar çoklu lig öncesi EU verisidir — TSL'e sızmamalı).
  const supL = seed([{ key: `bonus:${SY}`, value: { q1: 7 } }])
  const euLegacy = await buildLeaguePayload(supL, { league: 'EU' })
  assert.equal(euLegacy.standings.find(r => r.id === 'q1').points, 7, 'EU eski anahtara düşer (göç güvenliği)')
  const tslLegacy = await buildLeaguePayload(supL, { league: 'TSL' })
  assert.equal(tslLegacy.standings.find(r => r.id === 'q1').points, 0, 'TSL eski (EU) bonusunu ALMAZ')
})

suite.test('api /api/league GET: bilinmeyen lig 400, geçersiz sezon 400', async () => {
  const req = q => new Request(`http://localhost:8787/api/league${q}`)
  const badLeague = await leagueGET(req('?league=XX'))
  assert.equal(badLeague.status, 400)
  assert.equal((await badLeague.json()).error, 'Bilinmeyen lig.')

  for (const season of ['abc', '203', '20265', '-2026', '20a6']) {
    const res = await leagueGET(req(`?season=${encodeURIComponent(season)}`))
    assert.equal(res.status, 400, `season=${season} → 400`)
    assert.equal((await res.json()).error, 'Geçersiz sezon.')
  }

  // Lig denetimi önce: birleşik hatalı istemde lig mesajı döner.
  const both = await leagueGET(req('?league=XX&season=xx'))
  assert.equal((await both.json()).error, 'Bilinmeyen lig.')

  const post = await leagueGET(new Request('http://localhost:8787/api/league', { method: 'POST' }))
  assert.equal(post.status, 405)
})

await runIfMain(suite)
export { suite }
