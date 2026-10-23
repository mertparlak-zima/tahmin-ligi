// Produksiyon tahminlerini eski (kaynak) DB ile karşılaştırır;
// fark varsa --write ile kaynak değeri geri yükler.
// Kullanım: node --env-file=.env scripts/verify-predictions.mjs [--write]

import { DatabaseSync } from 'node:sqlite'
import { getSupabase } from '../lib/supabase.js'

const WRITE = process.argv.includes('--write')
const OLD_DB = 'C:/Users/mertp/Desktop/projects/ogünProje/data/league.db'

const old = new DatabaseSync(OLD_DB, { readOnly: true })
const oldRows = old
  .prepare(
    `SELECT p.name AS player, m.kickoff_utc AS kickoff, m.home_name AS home, m.away_name AS away,
            pr.outcome AS outcome
     FROM predictions pr
     JOIN players p ON p.id = pr.player_id
     JOIN matches m ON m.id = pr.match_id`
  )
  .all()

const supabase = getSupabase()
const [playersRes, matchesRes, predictionsRes] = await Promise.all([
  supabase.from('players').select('id, name'),
  supabase.from('matches').select('id, kickoff, home_name, away_name'),
  supabase.from('predictions').select('player_id, match_id, outcome'),
])

const nameToId = new Map(playersRes.data.map(p => [p.name.toLowerCase(), p.id]))

// Eşleştirme: (1) birebir isim → (2) normalize isim kümesi → (3) aynı taraf
// aynı Türk kulübü → yoksa eşleşme yok (raporlanır, atlanır).
const TR_CLUBS = ['fenerbahçe', 'galatasaray', 'beşiktaş', 'trabzonspor']
const norm = s =>
  s.toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(fc|cf|sc|fk|sk|pae|club|clube|de)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()
const normSet = m => new Set([norm(m.home_name), norm(m.away_name)])
const sideClub = m => {
  const home = m.home_name.toLowerCase(), away = m.away_name.toLowerCase()
  return TR_CLUBS.map(club => ({ club, side: home.includes(club) ? 'H' : away.includes(club) ? 'A' : null }))
}
const matches = matchesRes.data
const matchOld = row => {
  const t = Date.parse(row.kickoff)
  const candidates = matches.filter(m => Date.parse(m.kickoff) === t)
  if (candidates.length === 0) return null
  const exact = candidates.find(m => m.home_name === row.home && m.away_name === row.away)
  if (exact) return exact
  const target = new Set([norm(row.home), norm(row.away)])
  const byNorm = candidates.filter(m => {
    const ns = normSet(m)
    return ns.size === target.size && [...target].every(x => ns.has(x))
  })
  if (byNorm.length === 1) return byNorm[0]
  const oldClubs = sideClub({ home_name: row.home, away_name: row.away }).filter(s => s.side)
  const byClub = candidates.filter(m => {
    const sides = sideClub(m)
    return oldClubs.every(oc => sides.find(sc => sc.club === oc.club && sc.side === oc.side))
  })
  if (byClub.length === 1) return byClub[0]
  return null
}

const current = new Map(predictionsRes.data.map(p => [`${p.player_id}:${p.match_id}`, p.outcome]))

const diffs = []
let matched = 0
for (const row of oldRows) {
  const playerId = nameToId.get(row.player.toLowerCase())
  const match = matchOld(row)
  if (!playerId || !match) {
    diffs.push({ kind: 'ESLESME_YOK', player: row.player, kickoff: row.kickoff, home: row.home, away: row.away })
    continue
  }
  const key = `${playerId}:${match.id}`
  if (current.get(key) === row.outcome) {
    matched += 1
    continue
  }
  diffs.push({
    kind: 'FARK',
    player: row.player,
    match: `${match.home_name} - ${match.away_name}`,
    kickoff: match.kickoff,
    eski: row.outcome,
    yeni: current.get(key) ?? '(yok)',
    playerId,
    matchId: match.id,
  })
}

console.log(`eski tahmin: ${oldRows.length} | birebir aynı: ${matched} | fark: ${diffs.filter(d => d.kind === 'FARK').length} | eşleşmeyen: ${diffs.filter(d => d.kind === 'ESLESME_YOK').length}`)
for (const d of diffs) {
  console.log(`  [${d.kind}] ${d.player} · ${d.match ?? ''} ${d.kickoff ?? ''} ${d.eski ? `eski=${d.eski} yeni=${d.yeni}` : ''}`)
}

if (WRITE) {
  const repairs = diffs.filter(d => d.kind === 'FARK')
  for (const r of repairs) {
    const { error } = await supabase
      .from('predictions')
      .upsert(
        { player_id: r.playerId, match_id: r.matchId, outcome: r.eski, updated_at: new Date().toISOString() },
        { onConflict: 'player_id,match_id' }
      )
    console.log(error ? `  ✗ ${r.player}: ${error.message}` : `  ✓ geri yüklendi: ${r.player} → ${r.eski}`)
  }
  console.log(repairs.length ? 'ONARIM tamam' : 'Onarılacak fark yok')
} else if (diffs.some(d => d.kind === 'FARK')) {
  console.log('Onarım için: --write')
}
