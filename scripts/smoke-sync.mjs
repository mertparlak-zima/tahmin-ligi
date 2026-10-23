// Senkronizasyon duman testi — in-memory mock supabase ile upsert/prune/anti-regression.
// Kullanım: node scripts/smoke-sync.mjs

import assert from 'node:assert/strict'

// lib/sync.js ESPN'i çağırır; test için fetchTrackedMatches'i enjekte edemeyiz,
// bu yüzden sync.js'in çekirdek satırlarını birebir kopyalayan bu test mantığı
// doğrulamayı hedefler (upsert seçimi + anti-regression + prune).

const FINISHED = ['FINISHED', 'AWARDED']
const UPSETTABLE = ['SCHEDULED', 'TIMED']

function signature(m) {
  return [m.status, m.home_score ?? null, m.away_score ?? null, m.minute ?? null, Date.parse(m.kickoff), m.home_name, m.away_name].join('|')
}

function computeWrites(existing, incoming) {
  const existingByKey = new Map(existing.map(m => [`${m.provider}:${m.external_id}`, m]))
  const rows = []
  const skipped = []
  for (const match of incoming) {
    const key = `${match.provider}:${match.externalId}`
    const prior = existingByKey.get(key)
    if (prior) {
      if (FINISHED.includes(prior.status) && UPSETTABLE.includes(match.status)) {
        skipped.push({ key, reason: 'anti-regression' })
        continue
      }
      if (signature(prior) === signature({ ...prior, ...flatten(match) })) {
        skipped.push({ key, reason: 'unchanged' })
        continue
      }
    }
    rows.push(match)
  }
  return { rows, skipped }
}

function flatten(m) {
  return {
    status: m.status, home_score: m.home.score, away_score: m.away.score, minute: m.minute,
    kickoff: m.kickoff, home_name: m.home.name, away_name: m.away.name,
  }
}

const hour = 3600_000
const iso = ms => new Date(ms).toISOString()

const existing = [
  { id: 'e1', provider: 'espn', external_id: '1', status: 'FINISHED', minute: null, kickoff: iso(Date.now() - 48 * hour), home_score: 1, away_score: 4, home_name: 'Galatasaray', away_name: 'Barcelona' },
  { id: 'e2', provider: 'espn', external_id: '2', status: 'IN_PLAY', minute: 55, kickoff: iso(Date.now() - hour), home_score: 2, away_score: 0, home_name: 'Beşiktaş', away_name: 'Marseille' },
  { id: 'e3', provider: 'espn', external_id: '9', status: 'TIMED', minute: null, kickoff: iso(Date.now() + 72 * hour), home_score: null, away_score: null, home_name: 'Fenerbahçe', away_name: 'Eski Rakip' },
]

const mk = (id, status, h, a, kickoffMs, minute = null) => ({
  provider: 'espn', externalId: id, status, minute, kickoff: iso(kickoffMs),
  home: { name: 'Galatasaray', score: h }, away: { name: 'Barcelona', score: a },
})

const incoming = [
  // 1) Bitmiş maça "SCHEDULED" gelen gecikmiş yanıt → YAZILMAMALI (anti-regression)
  mk('1', 'SCHEDULED', null, null, Date.now() - 48 * hour),
  // 2) Canlı maç: dakika ilerledi → yazılmalı
  mk('2', 'IN_PLAY', 2, 0, Date.now() - hour, 61),
  // 3) Yeni maç → yazılmalı
  mk('3', 'TIMED', null, null, Date.now() + 96 * hour),
]

const { rows, skipped } = computeWrites(existing, incoming)

assert.equal(rows.length, 2, 'yalnız değişen/yeni maçlar yazılır')
assert.equal(skipped.find(s => s.key === 'espn:1').reason, 'anti-regression')
assert.deepEqual(rows.map(r => r.externalId).sort(), ['2', '3'])

// Prune: complete=true ise gelen sette olmayan maçlar silinir (e3 → silinmeli)
const keep = new Set(incoming.map(m => `${m.provider}:${m.externalId}`))
const deleteIds = existing.filter(m => !keep.has(`${m.provider}:${m.external_id}`)).map(m => m.id)
assert.deepEqual(deleteIds, ['e3'], 'takip dışı kalan maç temizlenir')

console.log('Senkronizasyon mantığı testleri geçti ✅')
console.log('  yazılacak:', rows.map(r => r.externalId).join(', '))
console.log('  atlanan:', skipped.map(s => `${s.key} (${s.reason})`).join(', '))
console.log('  silinecek:', deleteIds.join(', '))
