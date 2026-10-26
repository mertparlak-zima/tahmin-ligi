// Payload ve puanlama duman testi — in-memory mock supabase ile.
// Kullanım: node scripts/smoke-league.mjs
// #21: EU + TSL iki lig kapsamı da ölçülür (izolasyon + lig bazlı bonus).

import assert from 'node:assert/strict'
import { buildLeaguePayload } from '../lib/league.js'
import { seasonYear } from '../lib/espn.js'

const hour = 3600_000
const now = Date.now()
const iso = ms => new Date(ms).toISOString()
const SY = seasonYear(new Date())

const players = [
  { id: 'p1', name: 'Ogün', color: '#b8f34a', is_active: true },
  { id: 'p2', name: 'Mert', color: '#5ce1e6', is_active: true },
  { id: 'p3', name: 'Eski', color: '#ff9f68', is_active: false },
  // bonus_points LEGACY kolonu ve app_config bonus anahtarları artık okunmaz
  // (#24: bonus puanlar kaldırıldı; standings 0'dan başlar).
  { id: 'p4', name: 'Bonuslu', color: '#ffd05c', is_active: true, bonus_points: 2 },
]

// Satır fabrikası: dondurulmuş flag'ler tohumlarda da taşınır (P5); TSL
// satırları ...o override'ıyla lig+turnuva değiştirir.
const row = o => ({
  provider: 'espn', minute: null,
  home_tla: null, away_tla: null, home_crest: null, away_crest: null,
  matchday: 1, stage: null,
  league: 'EU',
  season_year: SY,
  ...o,
})

const matches = [
  row({
    id: 'm1', external_id: '1', competition: 'CL',
    kickoff: iso(now - 48 * hour), status: 'FINISHED',
    home_name: 'Galatasaray', home_short: 'Galatasaray', home_tla: 'GS',
    away_name: 'Barcelona', away_short: 'Barcelona', away_tla: 'BAR',
    home_score: 1, away_score: 4,
  }),
  row({
    id: 'm2', external_id: '2', competition: 'EL',
    kickoff: iso(now - 24 * hour), status: 'FINISHED',
    home_name: 'Beşiktaş', home_short: 'Beşiktaş', home_tla: 'BJK',
    away_name: 'Marseille', away_short: 'Marseille', away_tla: 'MAR',
    home_score: 4, away_score: 1,
  }),
  row({
    id: 'm3', external_id: '3', competition: 'UECL',
    kickoff: iso(now + 24 * hour), status: 'TIMED',
    home_name: 'Trabzonspor', home_short: 'Trabzonspor', home_tla: 'TS',
    away_name: 'KuPS Kuopio', away_short: 'KuPS', away_tla: 'KUPS',
    home_score: null, away_score: null,
  }),
  // #21 Süper Lig satırları (Samsunspor/Başakşehir/Konyaspor dahil).
  row({
    id: 't1', external_id: 't1', competition: 'TSL', league: 'TSL', matchday: null,
    kickoff: iso(now - 48 * hour), status: 'FINISHED',
    home_name: 'Galatasaray', home_short: 'Galatasaray', home_tla: 'GS',
    away_name: 'Samsunspor', away_short: 'Samsunspor', away_tla: 'SAM',
    home_score: 2, away_score: 0,
  }),
  row({
    id: 't2', external_id: 't2', competition: 'TSL', league: 'TSL', matchday: null,
    kickoff: iso(now + 24 * hour), status: 'TIMED',
    home_name: 'Başakşehir', home_short: 'Başakşehir', home_tla: 'BAŞ',
    away_name: 'Fenerbahçe', away_short: 'Fenerbahçe', away_tla: 'FB',
    home_score: null, away_score: null,
  }),
  row({
    id: 't3', external_id: 't3', competition: 'TSL', league: 'TSL', matchday: null,
    kickoff: iso(now - 24 * hour), status: 'FINISHED',
    home_name: 'Konyaspor', home_short: 'Konyaspor', home_tla: 'KON',
    away_name: 'Trabzonspor', away_short: 'Trabzonspor', away_tla: 'TS',
    home_score: 1, away_score: 1,
  }),
]

// U9: tahmin satırlarına Date.now türevli zaman damgaları tohumlanır —
// payload boyut ölçümü gerçekçi olsun (bilgi satırı; kapı değil).
const predictions = [
  { player_id: 'p1', match_id: 'm1', outcome: 'H', created_at: iso(now - 50 * hour), updated_at: iso(now - 50 * hour) }, // yanlış (A kazandı)
  { player_id: 'p1', match_id: 'm2', outcome: 'H', created_at: iso(now - 52 * hour), updated_at: iso(now - 30 * hour) }, // doğru → 1 puan (sonra güncellendi)
  { player_id: 'p1', match_id: 'm3', outcome: 'H', created_at: iso(now - 20 * hour), updated_at: iso(now - 20 * hour) }, // gelecek → mühürlü
  { player_id: 'p2', match_id: 'm1', outcome: 'A', created_at: iso(now - 49 * hour), updated_at: iso(now - 49 * hour) }, // doğru → 1 puan
  { player_id: 'p2', match_id: 'm2', outcome: 'D', created_at: iso(now - 51 * hour), updated_at: iso(now - 12 * hour) }, // yanlış (güncellendi)
  { player_id: 'p3', match_id: 'm1', outcome: 'A', created_at: iso(now - 48 * hour), updated_at: iso(now - 48 * hour) }, // pasif oyuncu → sayılmamalı
  { player_id: 'p4', match_id: 'm1', outcome: 'A', created_at: iso(now - 47 * hour), updated_at: iso(now - 47 * hour) }, // doğru → 1 puan (bonus yok, #24)
  // #21 TSL tahminleri: t1 GS kazanır (H), t3 beraberlik (D), t2 gelecek → mühürlü.
  { player_id: 'p1', match_id: 't1', outcome: 'H', created_at: iso(now - 46 * hour), updated_at: iso(now - 46 * hour) }, // doğru → TSL 1 puan
  { player_id: 'p1', match_id: 't3', outcome: 'D', created_at: iso(now - 22 * hour), updated_at: iso(now - 22 * hour) }, // doğru → TSL 1 puan
  { player_id: 'p2', match_id: 't1', outcome: 'A', created_at: iso(now - 45 * hour), updated_at: iso(now - 45 * hour) }, // yanlış
  { player_id: 'p2', match_id: 't2', outcome: 'H', created_at: iso(now - 10 * hour), updated_at: iso(now - 10 * hour) }, // gelecek → mühürlü
  { player_id: 'p4', match_id: 't1', outcome: 'A', created_at: iso(now - 44 * hour), updated_at: iso(now - 44 * hour) }, // yanlış (EU bonusu TSL'e sızmaz)
]

function mockSupabase() {
  const tables = {
    players, matches, predictions,
    app_config: [
      { key: 'scoring', value: { label: 'Test', status: 'final', correctOutcome: 1 } },
      // #24: lig bazlı sezonluk bonus anahtarları tohumda kalır — artık yok
      // sayılır (standings 0'dan başlar).
      { key: `bonus:EU:${SY}`, value: { p4: 2 } },
      { key: `bonus:TSL:${SY}`, value: { p2: 1 } },
    ],
  }
  const singletons = {
    sync_state: { last_attempt_at: iso(now), last_success_at: iso(now), last_error: null, matches_seen: 6 },
  }

  function builder(rows) {
    return {
      data: structuredClone(rows),
      select() { return this },
      order() { return this },
      eq(key, value) {
        // Genel filtre: lig/sezon dahil tüm eq'ler uygulanır (izolasyon ölçülür).
        this.data = this.data.filter(r => r[key] === value)
        return this
      },
      maybeSingle() { return { data: this.data[0] ?? null } },
      single() { return { data: this.data[0] ?? null } },
    }
  }

  return {
    from(table) {
      if (table in singletons) return builder([singletons[table]])
      return builder(tables[table])
    },
  }
}

const payload = await buildLeaguePayload(mockSupabase())

// --- Temel (EU kapsamı; önceki davranışla aynı) ---
assert.equal(payload.meta.counts.matches, 3, 'EU payload yalnız 3 EU maçı')
assert.equal(payload.meta.counts.finished, 2)
assert.equal(payload.players.length, 3, 'pasif oyuncu listede olmamalı (3 aktif: Ogün, Mert, Bonuslu)')
assert.deepEqual(payload.competitions.map(c => c.code), ['CL', 'EL', 'UECL'], 'EU competitions lig kapsamında')

// --- Mühür ---
const future = payload.matches.find(m => m.id === 'm3')
assert.equal(future.predictionsVisible, false, 'gelecek maç mühürlü olmalı')
assert.equal(future.predictionCount, 1, 'tahmin sayısı herkese açık')
const sealedPred = future.predictions[0]
assert.equal(sealedPred.outcome, undefined, 'mühürlü tahminin sonucu sızmamalı')
assert.equal(sealedPred.name, 'Ogün', 'kimin tahmin yaptığı görünür')
// U9 (#20 diyet): damga satırda DEĞİL — meta.recentPredictions olaylarında.
assert.equal(sealedPred.enteredAt, undefined, 'satır damga taşımaz')
const ev = payload.recentPredictions.find(r => r.matchId === 'm3')
assert.ok(ev, 'mühürlü maçın girişi akış olaylarında')
assert.equal(ev.playerId, sealedPred.playerId)
assert.equal(ev.enteredAt, iso(now - 20 * hour), 'giriş zamanı olayda taşınır')
assert.equal('outcome' in ev, false, 'olayda outcome YOK')

const past = payload.matches.find(m => m.id === 'm1')
assert.equal(past.predictionsVisible, true)

// --- Puanlama (EU) ---
const ogun = payload.standings.find(r => r.id === 'p1')
const mert = payload.standings.find(r => r.id === 'p2')
assert.equal(ogun.points, 1, 'm2 doğru (1 puan), m1 yanlış; TSL doğruları SIZMAZ')
assert.equal(mert.points, 1, 'm1 doğru (1 puan), m2 yanlış')
assert.equal(ogun.correctOutcomes, 1)
assert.equal(ogun.played, 2, 'iki bitmiş EU maçına da tahmin girdi')
assert.equal(mert.played, 2)

// teamCorrect: p1 m2 (Beşiktaş galibiyeti) doğru → BJK=1; TSL GS doğrusu sızmaz
assert.equal(ogun.teamCorrect.BJK, 1)
assert.equal(ogun.teamCorrect.GS, 0, 'TSL GS doğrusu EU teamCorrect\'e sızmaz')
// p2 m1 (Galatasaray maçı, Barcelona yener) doğru → GS=1
assert.equal(mert.teamCorrect.GS, 1)

// #24: p4 doğru sonuç 1 puan — bonus anahtarları yok sayılır
const bonuslu = payload.standings.find(r => r.id === 'p4')
assert.equal(bonuslu.points, 1)

// Sıralama: eşit puan → doğru sayısı → isim
assert.equal(payload.standings[0].rank, 1)

// --- Maç içi tahmin rozetleri ---
const m1Pred = past.predictions.find(p => p.playerId === 'p2')
assert.equal(m1Pred.points, 1)
assert.equal(m1Pred.label, 'Barcelona yener')

// --- #21 TSL kapsamı ---
const tslPayload = await buildLeaguePayload(mockSupabase(), { league: 'TSL' })
assert.deepEqual(tslPayload.matches.map(m => m.id).sort(), ['t1', 't2', 't3'], 'TSL payload yalnız TSL maçları')
assert.deepEqual(tslPayload.competitions, [{ code: 'TSL', name: 'Süper Lig' }], 'TSL competitions tek turnuva')
assert.equal(tslPayload.meta.counts.matches, 3)
assert.equal(tslPayload.meta.counts.finished, 2)

const tslSealed = tslPayload.matches.find(m => m.id === 't2').predictions[0]
assert.equal(tslPayload.matches.find(m => m.id === 't2').predictionsVisible, false, 'TSL gelecek maçı da mühürlü')
assert.equal(tslSealed.outcome, undefined)
assert.equal(tslSealed.name, 'Mert')

const tOgun = tslPayload.standings.find(r => r.id === 'p1')
const tMert = tslPayload.standings.find(r => r.id === 'p2')
const tBonuslu = tslPayload.standings.find(r => r.id === 'p4')
assert.equal(tOgun.points, 2, 'TSL: t1+t3 doğru; EU doğruları sızmaz')
assert.equal(tOgun.played, 2)
assert.equal(tOgun.teamCorrect.GS, 1, 'TSL GS doğrusu TSL tablosunda')
assert.equal(tMert.points, 0, 'TSL tahmin doğrusu yok — bonus anahtarı yok sayılır (#24)')
assert.equal(tBonuslu.points, 0, 'EU bonusu TSL tablosuna SIZMAZ')

// --- U9: payload boyut bilgisi (kapı DEĞİL; öncesi/sonrası leader karşılaştırır) ---
const payloadJson = JSON.stringify(payload)
const predRowCount = payload.matches.reduce((s, m) => s + m.predictions.length, 0)
console.log(`Payload JSON boyutu: ${payloadJson.length} bayt · ${payload.matches.length} maç · ${predRowCount} tahmin satırı (damgalar Date.now türevli ISO)`)

console.log('Tüm payload/puanlama testleri geçti ✅')
console.log('EU standings:', payload.standings.map(r => `${r.rank}. ${r.name} ${r.points}P (FB${r.teamCorrect.FB} GS${r.teamCorrect.GS} BJK${r.teamCorrect.BJK} TS${r.teamCorrect.TS})`))
console.log('TSL standings:', tslPayload.standings.map(r => `${r.rank}. ${r.name} ${r.points}P`))
