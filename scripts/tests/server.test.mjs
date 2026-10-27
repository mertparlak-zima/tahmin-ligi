// Sunucu katmanı (lib/ + api/) offline test girişi.
// Kullanım: node scripts/tests/server.test.mjs
// Çıkış kodu: 0 = tüm testler geçti, 1 = en az bir hata.

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { suite as espnSuite } from './espn.test.mjs'
import { suite as targetsSuite } from './targets.test.mjs'
import { suite as leagueSuite } from './league.test.mjs'
import { suite as predictionsSuite } from './predictions.test.mjs'
import { suite as playersSuite } from './players.test.mjs'
import { suite as syncSuite } from './sync.test.mjs'
import { suite as calendarSuite } from './calendar.test.mjs'
import { suite as flowSuite } from './flow.test.mjs'
import { suite as notifySuite } from './notify.test.mjs'

const results = []
for (const suite of [espnSuite, targetsSuite, leagueSuite, predictionsSuite, playersSuite, syncSuite, calendarSuite, flowSuite, notifySuite]) {
  results.push(await suite.run())
}

// Mevcut duman testleri (smoke-league, smoke-sync) aynen korunur ve burada da koşar.
for (const smoke of ['smoke-league.mjs', 'smoke-sync.mjs']) {
  const script = fileURLToPath(new URL(`../${smoke}`, import.meta.url))
  const proc = spawnSync(process.execPath, [script], { encoding: 'utf8' })
  const lines = (proc.stdout + proc.stderr).trim().split('\n')
  const passed = proc.status === 0
  console.log(`\n== smoke · ${smoke} ==`)
  console.log(lines.length ? lines.map(l => `  ${l}`).join('\n') : '  (çıktı yok)')
  if (!passed && proc.status !== 0) {
    console.log(`  ✗ çıkış kodu ${proc.status}`)
  }
  results.push({ name: `smoke · ${smoke}`, pass: passed ? 1 : 0, fail: passed ? 0 : 1 })
}

const totalPass = results.reduce((s, r) => s + r.pass, 0)
const totalFail = results.reduce((s, r) => s + r.fail, 0)

console.log('\n================ ÖZET ================')
for (const r of results) {
  console.log(`${r.fail > 0 ? '✗' : '✓'} ${r.name}: ${r.pass} geçti, ${r.fail} kaldı`)
}
console.log(`TOPLAM: ${totalPass} geçti, ${totalFail} kaldı`)
console.log('SONUÇ:', totalFail === 0 ? 'TÜM TESTLER GEÇTİ ✅' : 'TESTLER BAŞARISIZ ❌')

process.exitCode = totalFail === 0 ? 0 : 1
