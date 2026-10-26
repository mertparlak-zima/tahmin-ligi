// Hızlı duman testi: ESPN sağlayıcısı ve takım filtresi.
// Kullanım: node scripts/smoke-espn.mjs [--league=EU|TSL]
// TSL modu gerçek tur.1 (Süper Lig) çekimidir: takım filtresi YOK, tüm
// fikstür beklenir (sezon taraması >50 maç; UEFA "30 maç" eşiği kullanılmaz).

import assert from 'node:assert/strict'
import { fetchTrackedMatches, seasonYear } from '../lib/espn.js'
import { LEAGUE_BY_CODE, canonicalTeam, normalizeName } from '../lib/targets.js'

const leagueArg = process.argv.find(a => a.startsWith('--league='))?.slice('--league='.length) ?? 'EU'
if (!LEAGUE_BY_CODE[leagueArg]) {
  console.error(`Bilinmeyen lig: ${leagueArg} (beklenen: EU | TSL)`)
  process.exit(1)
}

console.log('seasonYear:', seasonYear(), '| lig:', leagueArg)

console.log('normalize:', normalizeName('FENERBAHÇE'), '|', normalizeName('  Beşiktaş '), '|', normalizeName('Trabzonspor'))
console.log('canonical:', canonicalTeam('Fenerbahce SK')?.name, '|', canonicalTeam('Galatasaray')?.name, '|', canonicalTeam('Barcelona'))

const { matches, complete, errors } = await fetchTrackedMatches(new Date(), { league: leagueArg })
console.log(`complete=${complete} matches=${matches.length}`)
if (errors.length) console.log('errors:', errors)

const byComp = {}
for (const m of matches) byComp[m.competitionCode] = (byComp[m.competitionCode] ?? 0) + 1
console.log('by competition:', byComp)

// #21 TSL: tüm Süper Lig fikstürü gelmeli — takım filtresi uygulanmaz,
// turnuva kodu tek (TSL) ve week taşınmadığından matchday null'dur.
if (leagueArg === 'TSL') {
  assert.ok(matches.length > 50, `Süper Lig sezon taraması >50 maç beklenirdi, gelen: ${matches.length}`)
  assert.ok(matches.every(m => m.competitionCode === 'TSL'), 'tüm maçlar TSL turnuva kodlu olmalı')
  assert.ok(matches.every(m => m.matchday === null), 'tur.1 week taşımaz → matchday null')
  const nonBigFour = matches.filter(m => !canonicalTeam(m.home.name) && !canonicalTeam(m.away.name))
  assert.ok(nonBigFour.length > 0, `4 büyükler dışı maçlar da gelmeli (filtre yok), gelen: ${nonBigFour.length}`)
  console.log(`4 büyükler dışı maç: ${nonBigFour.length}/${matches.length}`)
}

for (const m of matches.slice(0, 6)) {
  console.log(
    `${m.competitionCode} ${m.kickoff} ${m.status}${m.minute ? ` ${m.minute}'` : ''} :: ${m.home.name} ${m.home.score ?? '-'} - ${m.away.score ?? '-'} ${m.away.name}`
  )
}
const live = matches.filter(m => ['IN_PLAY', 'PAUSED'].includes(m.status))
console.log('live count:', live.length)
