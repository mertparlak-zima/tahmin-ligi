// B · lib/targets.js testleri — Türkçe normalizasyon + takım eşleme.

import assert from 'node:assert/strict'
import { canonicalTeam, isTrackedMatch, normalizeName, teamCode } from '../../lib/targets.js'
import { createSuite, runIfMain } from './helpers.mjs'

const suite = createSuite('B · lib/targets.js')

suite.test('normalizeName: Türkçe karakterler, aksanlar, büyük harf, boşluk', () => {
  const cases = [
    ['Fenerbahçe', 'fenerbahce'],
    ['GALATASARAY', 'galatasaray'],
    ['İstanbul Başakşehir', 'istanbul basaksehir'],
    ['çağlar ırmak', 'caglar irmak'],
    ['BEŞİKTAŞ JK', 'besiktas jk'],
    ['Atlético Madrid', 'atletico madrid'],
    ['Malmö FF', 'malmo ff'],
    ['  Trabzonspor   Kulübü ', 'trabzonspor kulubu'],
    [null, ''],
    [undefined, ''],
    [42, '42'],
  ]
  for (const [input, expected] of cases) {
    assert.equal(normalizeName(input), expected, `normalizeName(${JSON.stringify(input)})`)
  }
})

suite.test('canonicalTeam: takip edilen takımlar substring ile bulunur', () => {
  assert.equal(canonicalTeam('Fenerbahçe')?.code, 'FB')
  assert.equal(canonicalTeam('Fenerbahce SK')?.code, 'FB')
  assert.equal(canonicalTeam('Galatasaray')?.code, 'GS')
  assert.equal(canonicalTeam('galatasaray a2')?.code, 'GS', 'büyük/küçük harf duyarsız')
  assert.equal(canonicalTeam('Beşiktaş JK')?.code, 'BJK')
  assert.equal(canonicalTeam('Besiktas')?.code, 'BJK')
  assert.equal(canonicalTeam('Trabzonspor')?.code, 'TS')
})

suite.test('canonicalTeam: benzer/bağımsız adlar eşleşmez', () => {
  assert.equal(canonicalTeam('Trabzon Karadenizspor'), null, 'Trabzonspor içermiyor')
  assert.equal(canonicalTeam('Karadenizspor'), null)
  assert.equal(canonicalTeam('Barcelona'), null)
  assert.equal(canonicalTeam(''), null)
  assert.equal(canonicalTeam(null), null)
})

suite.test('isTrackedMatch: tek taraf takip edilen yeter', () => {
  assert.equal(isTrackedMatch('Galatasaray', 'Barcelona'), true)
  assert.equal(isTrackedMatch('Barcelona', 'Fenerbahçe'), true, 'away tarafı da yeter')
  assert.equal(isTrackedMatch('Barcelona', 'Lyon'), false)
  assert.equal(isTrackedMatch('Trabzon Karadenizspor', 'Rijeka'), false)
})

suite.test('teamCode: kod eşlemesi, takip dışı null', () => {
  assert.equal(teamCode('Fenerbahçe'), 'FB')
  assert.equal(teamCode('Galatasaray SK'), 'GS')
  assert.equal(teamCode('Beşiktaş'), 'BJK')
  assert.equal(teamCode('Trabzonspor'), 'TS')
  assert.equal(teamCode('Barcelona'), null)
})

await runIfMain(suite)
export { suite }
