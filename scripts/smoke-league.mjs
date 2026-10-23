// Payload ve puanlama duman testi — in-memory mock supabase ile.
// Kullanım: node scripts/smoke-league.mjs

import assert from 'node:assert/strict'
import { buildLeaguePayload } from '../lib/league.js'

const hour = 3600_000
const now = Date.now()
const iso = ms => new Date(ms).toISOString()

const players = [
  { id: 'p1', name: 'Ogün', color: '#b8f34a', is_active: true },
  { id: 'p2', name: 'Mert', color: '#5ce1e6', is_active: true },
  { id: 'p3', name: 'Eski', color: '#ff9f68', is_active: false },
]

const matches = [
  {
    id: 'm1', provider: 'espn', external_id: '1', competition: 'CL',
    kickoff: iso(now - 48 * hour), status: 'FINISHED', minute: null,
    home_name: 'Galatasaray', home_short: 'Galatasaray', home_tla: 'GS', home_crest: null,
    away_name: 'Barcelona', away_short: 'Barcelona', away_tla: 'BAR', away_crest: null,
    home_score: 1, away_score: 4,
  },
  {
    id: 'm2', provider: 'espn', external_id: '2', competition: 'EL',
    kickoff: iso(now - 24 * hour), status: 'FINISHED', minute: null,
    home_name: 'Beşiktaş', home_short: 'Beşiktaş', home_tla: 'BJK', home_crest: null,
    away_name: 'Marseille', away_short: 'Marseille', away_tla: 'MAR', away_crest: null,
    home_score: 4, away_score: 1,
  },
  {
    id: 'm3', provider: 'espn', external_id: '3', competition: 'UECL',
    kickoff: iso(now + 24 * hour), status: 'TIMED', minute: null,
    home_name: 'Trabzonspor', home_short: 'Trabzonspor', home_tla: 'TS', home_crest: null,
    away_name: 'KuPS Kuopio', away_short: 'KuPS', away_tla: 'KUPS', away_crest: null,
    home_score: null, away_score: null,
  },
]

const predictions = [
  { player_id: 'p1', match_id: 'm1', outcome: 'H' }, // yanlış (A kazandı)
  { player_id: 'p1', match_id: 'm2', outcome: 'H' }, // doğru → 1 puan
  { player_id: 'p1', match_id: 'm3', outcome: 'H' }, // gelecek → mühürlü
  { player_id: 'p2', match_id: 'm1', outcome: 'A' }, // doğru → 1 puan
  { player_id: 'p2', match_id: 'm2', outcome: 'D' }, // yanlış
  { player_id: 'p3', match_id: 'm1', outcome: 'A' }, // pasif oyuncu → sayılmamalı
]

function mockSupabase() {
  const tables = { players, matches, predictions }
  const singletons = {
    app_config: { value: { label: 'Test', status: 'final', correctOutcome: 1 } },
    sync_state: { last_attempt_at: iso(now), last_success_at: iso(now), last_error: null, matches_seen: 3 },
  }

  function builder(rows) {
    return {
      data: structuredClone(rows),
      select() { return this },
      order() { return this },
      eq(key, value) {
        if (singletons[key] !== undefined || key === 'key' || key === 'id') {
          // app_config 'key' / sync_state 'id' filtreleri: eşleşmeyi uygula
          this.data = this.data.filter(r => r[key] === value)
        }
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

// --- Temel ---
assert.equal(payload.meta.counts.matches, 3)
assert.equal(payload.meta.counts.finished, 2)
assert.equal(payload.players.length, 2, 'pasif oyuncu listede olmamalı')

// --- Mühür ---
const future = payload.matches.find(m => m.id === 'm3')
assert.equal(future.predictionsVisible, false, 'gelecek maç mühürlü olmalı')
assert.equal(future.predictionCount, 1, 'tahmin sayısı herkese açık')
const sealedPred = future.predictions[0]
assert.equal(sealedPred.outcome, undefined, 'mühürlü tahminin sonucu sızmamalı')
assert.equal(sealedPred.name, 'Ogün', 'kimin tahmin yaptığı görünür')

const past = payload.matches.find(m => m.id === 'm1')
assert.equal(past.predictionsVisible, true)

// --- Puanlama ---
const ogun = payload.standings.find(r => r.id === 'p1')
const mert = payload.standings.find(r => r.id === 'p2')
assert.equal(ogun.points, 1, 'm2 doğru (1 puan), m1 yanlış')
assert.equal(mert.points, 1, 'm1 doğru (1 puan), m2 yanlış')
assert.equal(ogun.correctOutcomes, 1)
assert.equal(ogun.played, 2, 'iki bitmiş maça da tahmin girdi')
assert.equal(ogun.missed, 0)
assert.equal(mert.played, 2)
assert.equal(mert.missed, 0)

// teamCorrect: p1 m2 (Beşiktaş galibiyeti) doğru → BJK=1
assert.equal(ogun.teamCorrect.BJK, 1)
// p2 m1 (Galatasaray maçı, Barcelona yener) doğru → GS=1
assert.equal(mert.teamCorrect.GS, 1)

// Sıralama: eşit puan → doğru sayısı → isim
assert.equal(payload.standings[0].rank, 1)

// Form
assert.deepEqual(mert.form, [1, 0])

// --- Maç içi tahmin rozetleri ---
const m1Pred = past.predictions.find(p => p.playerId === 'p2')
assert.equal(m1Pred.points, 1)
assert.equal(m1Pred.label, 'Barcelona yener')

console.log('Tüm payload/puanlama testleri geçti ✅')
console.log('Standings:', payload.standings.map(r => `${r.rank}. ${r.name} ${r.points}P (FB${r.teamCorrect.FB} GS${r.teamCorrect.GS} BJK${r.teamCorrect.BJK} TS${r.teamCorrect.TS})`))
