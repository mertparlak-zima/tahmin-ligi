// Hızlı duman testi: ESPN sağlayıcısı ve takım filtresi.
// Kullanım: node scripts/smoke-espn.mjs

import { fetchTrackedMatches, seasonYear } from '../lib/espn.js'
import { normalizeName, canonicalTeam } from '../lib/targets.js'

console.log('seasonYear:', seasonYear())

console.log('normalize:', normalizeName('FENERBAHÇE'), '|', normalizeName('  Beşiktaş '), '|', normalizeName('Trabzonspor'))
console.log('canonical:', canonicalTeam('Fenerbahce SK')?.name, '|', canonicalTeam('Galatasaray')?.name, '|', canonicalTeam('Barcelona'))

const { matches, complete, errors } = await fetchTrackedMatches()
console.log(`complete=${complete} matches=${matches.length}`)
if (errors.length) console.log('errors:', errors)

const byComp = {}
for (const m of matches) byComp[m.competitionCode] = (byComp[m.competitionCode] ?? 0) + 1
console.log('by competition:', byComp)

for (const m of matches.slice(0, 6)) {
  console.log(
    `${m.competitionCode} ${m.kickoff} ${m.status}${m.minute ? ` ${m.minute}'` : ''} :: ${m.home.name} ${m.home.score ?? '-'} - ${m.away.score ?? '-'} ${m.away.name}`
  )
}
const live = matches.filter(m => ['IN_PLAY', 'PAUSED'].includes(m.status))
console.log('live count:', live.length)
