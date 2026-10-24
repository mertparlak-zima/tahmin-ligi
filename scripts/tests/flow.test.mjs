// G · utils/flow.js testleri — akış türetimi (mühür, sıralama, limit).

import assert from 'node:assert/strict'
import { buildFlowEvents } from '../../src/utils/flow.js'
import { createSuite, hour, runIfMain } from './helpers.mjs'

const suite = createSuite('G · utils/flow.js')

const now = Date.now()
const iso = ms => new Date(ms).toISOString()

const players = [
  { id: 'p1', name: 'Ali', initials: 'AL', color: '#5ce1e6', avatarUrl: null },
  { id: 'p2', name: 'Ece', initials: 'EC', color: '#ff9f68', avatarUrl: 'http://x/a.jpg' },
]
const matches = [
  {
    id: 'm1', competitionCode: 'CL', kickoff: iso(now - 90 * hour), isFinished: true,
    statusGroup: 'finished', predictionsVisible: true,
    home: { short: 'Galatasaray' }, away: { short: 'Barcelona' },
    score: { home: 1, away: 4 },
    predictions: [
      { playerId: 'p1', correct: true },
      { playerId: 'p2', correct: false },
    ],
  },
  {
    id: 'm2', competitionCode: 'UECL', kickoff: iso(now + 24 * hour), isFinished: false,
    statusGroup: 'upcoming', predictionsVisible: false,
    home: { short: 'KuPS' }, away: { short: 'Trabzonspor' },
    predictions: [{ playerId: 'p2' }],
  },
  {
    id: 'm3', competitionCode: 'EL', kickoff: iso(now - 200 * hour), isFinished: false,
    statusGroup: 'inactive', predictionsVisible: false,
    home: { short: 'Beşiktaş' }, away: { short: 'Lyon' },
    predictions: [{ playerId: 'p1' }],
  },
]

suite.test('tahmin olayları: girdi/güncelledi ayrımı + outcome YOK', () => {
  const events = buildFlowEvents({
    recentPredictions: [
      { playerId: 'p1', matchId: 'm2', enteredAt: iso(now - 5 * hour), updatedAt: iso(now - 5 * hour) },
      { playerId: 'p2', matchId: 'm2', enteredAt: iso(now - 8 * hour), updatedAt: iso(now - 1 * hour) },
    ],
    matches,
    players,
  })
  const preds = events.filter(e => e.type === 'prediction')
  assert.equal(preds.length, 2)
  const json = JSON.stringify(preds)
  assert.equal(json.includes('outcome'), false, 'olayda outcome alanı hiç olmamalı')
  const ece = preds.find(e => e.playerId === 'p2')
  assert.equal(ece.kind, 'updated', 'updated > entered → güncelledi')
  assert.equal(ece.teams, 'KuPS – Trabzonspor')
  assert.equal(ece.playerAvatarUrl, 'http://x/a.jpg')
  const ali = preds.find(e => e.playerId === 'p1')
  assert.equal(ali.kind, 'entered', 'created==updated → girdi')
})

suite.test('sonuç olayları: skor + doğru sayısı; sıralama desc', () => {
  const events = buildFlowEvents({
    recentPredictions: [
      { playerId: 'p1', matchId: 'm2', enteredAt: iso(now - 1 * hour), updatedAt: iso(now - 1 * hour) },
    ],
    matches,
    players,
  })
  const results = events.filter(e => e.type === 'result')
  assert.equal(results.length, 1, 'yalnız bitmiş maç')
  assert.equal(results[0].score, '1 - 4')
  assert.equal(results[0].correctCount, 1)
  // En yeni olay en üstte: p1 girişi (-1s) > sonuç (kickoff -90s)
  assert.equal(events[0].type, 'prediction')
  assert.ok(Date.parse(events[0].at) >= Date.parse(events[1].at))
})

suite.test('ertelenmiş maç girişi: ertelendi dürüstlük etiketi verisi', () => {
  const events = buildFlowEvents({
    recentPredictions: [
      { playerId: 'p1', matchId: 'm3', enteredAt: iso(now - 250 * hour), updatedAt: iso(now - 250 * hour) },
    ],
    matches,
    players,
  })
  const ev = events.find(e => e.type === 'prediction')
  assert.equal(ev.matchStatus, 'inactive')
  assert.equal(ev.kickoffPast, true, 'kickoff geçmiş ama erteli → donuk')
})

suite.test('limit ve bilinmeyen oyuncu/maç atlar', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    playerId: 'p1', matchId: 'm2', enteredAt: iso(now - i * hour), updatedAt: iso(now - i * hour),
  }))
  many.push({ playerId: 'ghost', matchId: 'm2', enteredAt: iso(now), updatedAt: iso(now) })
  const events = buildFlowEvents({ recentPredictions: many, matches, players })
  const preds = events.filter(e => e.type === 'prediction')
  assert.equal(preds.length, 30, 'limit 30')
  assert.equal(preds.some(e => e.playerId === 'ghost'), false, 'bilinmeyen oyuncu atlanır')
  const withGhostMatch = buildFlowEvents({
    recentPredictions: [{ playerId: 'p1', matchId: 'nope', enteredAt: iso(now), updatedAt: iso(now) }],
    matches,
    players,
  })
  assert.equal(withGhostMatch.length, 1, 'yalnız sonuç olayı kalır (maç bilinmiyor)')
})

await runIfMain(suite)
export { suite }
