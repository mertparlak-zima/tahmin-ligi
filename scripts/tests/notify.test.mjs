// #29 · lib/notify.js testleri — gece özeti: compose/parçalama/sanitize/
// idempotency/başarısız gönderim + api/notify.js yetki kapısı (offline).

import assert from 'node:assert/strict'
import { sanitizeName, dateLabel, packChunks, runNightlyNotify } from '../../lib/notify.js'
import { GET as notifyGET } from '../../api/notify.js'
import { createSuite, createMemorySupabase, withStubbedFetch, hour, iso, runIfMain } from './helpers.mjs'

const suite = createSuite('#29 · lib/notify.js — Discord gece özeti')

const now = Date.now()

const players = [
  { id: 'p1', name: 'Ogün', is_active: true },
  { id: 'p2', name: 'Mert', is_active: true },
  { id: 'p3', name: 'Eski', is_active: false },
]

const matches = [
  { id: 'm1', league: 'TSL', season_year: 2026, competition: 'TSL', kickoff: iso(now - 48 * hour), status: 'FINISHED', home_name: 'Galatasaray', home_short: 'Galatasaray', away_name: 'Samsunspor', away_short: 'Samsunspor', home_score: 3, away_score: 1 },
  { id: 'm2', league: 'EU', season_year: 2026, competition: 'CL', kickoff: iso(now - 24 * hour), status: 'FINISHED', home_name: 'Beşiktaş', home_short: 'Beşiktaş', away_name: 'Lyon', away_short: 'Lyon', home_score: 1, away_score: 1 },
  { id: 'm3', league: 'TSL', season_year: 2026, competition: 'TSL', kickoff: iso(now - 26 * hour), status: 'FINISHED', home_name: 'Konyaspor', home_short: 'Konyaspor', away_name: 'Trabzonspor', away_short: 'Trabzonspor', home_score: 2, away_score: 0 },
  { id: 'm4', league: 'TSL', season_year: 2026, competition: 'TSL', kickoff: iso(now - 2 * hour), status: 'IN_PLAY', minute: 63, home_name: 'Fenerbahçe', home_short: 'Fenerbahçe', away_name: 'Konyaspor', away_short: 'Konyaspor', home_score: 1, away_score: 0 },
  { id: 'm5', league: 'TSL', season_year: 2026, competition: 'TSL', kickoff: iso(now - 72 * hour), status: 'FINISHED', home_name: 'Başakşehir', home_short: 'Başakşehir', away_name: 'Fenerbahçe', away_short: 'Fenerbahçe', home_score: 0, away_score: 1 },
  { id: 'm6', league: 'TSL', season_year: 2026, competition: 'TSL', kickoff: iso(now - 20 * hour), status: 'FINISHED', home_name: 'X', home_short: 'X', away_name: 'Y', away_short: 'Y', home_score: null, away_score: null },
]

const predictions = [
  { player_id: 'p1', match_id: 'm1', outcome: 'H' }, // doğru (3-1)
  { player_id: 'p2', match_id: 'm1', outcome: 'A' }, // yanlış
  { player_id: 'p1', match_id: 'm2', outcome: 'D' }, // doğru (1-1)
  { player_id: 'p3', match_id: 'm2', outcome: 'H' }, // pasif oyuncu — sayılmaz
  { player_id: 'p1', match_id: 'm5', outcome: 'A' }, // doğru (0-1) — zaten flag'li
]

const flagged = [
  { match_id: 'm5', league: 'TSL', season_year: 2026, home_name: 'Başakşehir', away_name: 'Fenerbahçe', home_score: 0, away_score: 1, sent_at: iso(now) },
]

const seedSupabase = () => createMemorySupabase({
  players, matches, predictions, match_notifications: flagged,
})

suite.test('sanitizeName: mention/markdown enjeksiyonu kırılır', () => {
  assert.equal(sanitizeName('**Mert**'), 'Mert')
  assert.equal(sanitizeName('@everyone'), 'everyone')
  assert.equal(sanitizeName('a_b`c'), 'abc')
  assert.equal(sanitizeName('|x| ~y~ >z'), 'x y z')
  assert.equal(sanitizeName('   '), '?')
  assert.ok(sanitizeName('x'.repeat(80)).length <= 40)
})

suite.test('dateLabel: tek gün gün-adı ile, aralık tire ile', () => {
  const single = dateLabel(['2026-10-27T18:00:00.000Z'])
  assert.match(single, /(Pzt|Sal|Çar|Per|Cum|Cmt|Paz)$/)
  assert.equal(dateLabel(['2026-10-27T18:00:00.000Z', '2026-10-27T19:30:00.000Z']), single, 'aynı gün tek etiket')
  assert.equal(dateLabel(['2026-10-25T18:00:00.000Z', '2026-10-27T18:00:00.000Z']), '25 Eki – 27 Eki')
})

suite.test("packChunks: uzun özet parçalanır, maç bloğu bölünmez, id'ler taşınır", () => {
  const small = packChunks([{ text: 'a', matchIds: ['m1'] }, { text: 'b', matchIds: [] }])
  assert.equal(small.length, 1)
  assert.deepEqual(small[0].matchIds, ['m1'])
  const big = 'z'.repeat(1000)
  const parts = Array.from({ length: 5 }, (_, i) => ({ text: `${big}#${i}`, matchIds: [`m${i}`] }))
  const chunks = packChunks(parts)
  assert.ok(chunks.length >= 3, '1000 karakterlik parçalar tek mesaja sığmaz')
  for (const chunk of chunks) assert.ok(chunk.text.length <= 1900)
  assert.deepEqual(chunks.flatMap(c => c.matchIds), ['m0', 'm1', 'm2', 'm3', 'm4'])
})

suite.test('dry-run: doğru özet metni, HİÇBİR yazma yapılmaz', async () => {
  const sup = seedSupabase()
  const result = await runNightlyNotify(sup, { dry: true })
  assert.equal(result.dry, true)
  assert.equal(result.sent, false)
  assert.equal(result.pendingCount, 2, 'm1 + m2 (m3 tahminsiz, m4 canlı, m5 flagli, m6 skorsuz)')
  assert.equal(result.skippedNoPred, 1, 'm3 sessiz')
  assert.equal(result.messageCount, 1)
  const text = result.chunks[0]
  assert.ok(text.startsWith('🏟 Tahmin Ligi · '), 'başlık ilk satır')
  assert.ok(text.includes('Galatasaray 3-1 Samsunspor'))
  assert.ok(text.includes('Ogün ✅ +1 · Mert ❌ 0'), 'doğru önce, sonra yanlış')
  assert.ok(text.includes('Beşiktaş 1-1 Lyon (ŞL)'), 'UEFA maçı kısa etiket taşır')
  assert.ok(!text.includes('Eski'), 'pasif oyuncunun tahmini satırda yok')
  assert.ok(!text.includes('Konyaspor'), 'tahminsiz maç özette yok')
  assert.ok(!text.includes('Fenerbahçe'), 'canlı maç özette yok')
  assert.ok(text.includes('📊 Süper Lig: 1. Ogün 2 · 2. Mert 0'), 'TSL puanı: m1 doğru + m5 (flagli) doğru')
  assert.ok(text.includes('📊 Avrupa: 1. Ogün 1 · 2. Mert 0'))
  // Hiçbir şey yazılmadı:
  const { data: flags } = await sup.from('match_notifications').select('match_id')
  assert.deepEqual(flags.map(f => f.match_id).sort(), ['m5'])
})

suite.test("gerçek gönderim: mesaj gider, gönderilen + tahminsiz maçlar flag'lenir", async () => {
  const sup = seedSupabase()
  const calls = []
  const result = await runNightlyNotify(sup, { webhookUrl: 'http://discord.test/hook', send: async (_url, content) => { calls.push(content) } })
  assert.equal(result.sent, true)
  assert.equal(result.messageCount, 1)
  assert.equal(calls.length, 1, 'tek özet mesajı')
  assert.ok(calls[0].includes('Galatasaray 3-1 Samsunspor'), 'gönderilen metin özetin kendisi')
  const { data: flags } = await sup.from('match_notifications').select('match_id')
  assert.deepEqual(flags.map(f => f.match_id).sort(), ['m1', 'm2', 'm3', 'm5'], 'm1+m2 gönderildi, m3 sessiz')
})

suite.test('idempotent: ikinci turda gönderilecek yok, send çağrılmaz', async () => {
  const sup = seedSupabase()
  await runNightlyNotify(sup, { webhookUrl: 'u', send: async () => {} })
  let called = 0
  const second = await runNightlyNotify(sup, { webhookUrl: 'u', send: async () => { called += 1 } })
  assert.equal(second.sent, false)
  assert.equal(second.pendingCount, 0)
  assert.equal(second.skippedNoPred, 0)
  assert.equal(called, 0)
})

suite.test('Discord hatası: flag YAZILMAZ → ertesi gece retry', async () => {
  const sup = seedSupabase()
  const result = await runNightlyNotify(sup, {
    webhookUrl: 'http://discord.test/hook',
    send: async () => { throw new Error('Discord webhook 429') },
  })
  assert.equal(result.sent, false)
  assert.equal(result.error, 'Discord webhook 429')
  const { data: flags } = await sup.from('match_notifications').select('match_id')
  assert.deepEqual(flags.map(f => f.match_id).sort(), ['m5'], 'hiçbir yeni flag yazılmadı')
})

suite.test('api/notify.js: üretimde CRON_SECRET yoksa uç kapalı (503)', async () => {
  const saved = process.env.CRON_SECRET
  delete process.env.CRON_SECRET
  const stub = withStubbedFetch([])
  try {
    const res = await notifyGET(new Request('http://x/api/notify'))
    assert.equal(res.status, 503)
  } finally {
    stub.restore()
    if (saved !== undefined) process.env.CRON_SECRET = saved
  }
})

suite.test('api/notify.js: yanlış/başlıksız Bearer 401; demo (supabase enjekte) 200 dry', async () => {
  const savedSecret = process.env.CRON_SECRET
  const savedHook = process.env.DISCORD_WEBHOOK_URL
  process.env.CRON_SECRET = 'test-secret-1234'
  delete process.env.DISCORD_WEBHOOK_URL
  const stub = withStubbedFetch([])
  try {
    assert.equal((await notifyGET(new Request('http://x/api/notify'))).status, 401)
    assert.equal((await notifyGET(new Request('http://x/api/notify', { headers: { authorization: 'Bearer wrong' } }))).status, 401)
    const webReq = new Request('http://x/api/notify?dry=1')
    webReq.supabase = seedSupabase()
    const res = await notifyGET(webReq)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.dry, true)
    assert.equal(body.pendingCount, 2)
    assert.ok(!JSON.stringify(body).includes('discord.test'), 'yanıtta webhook URL\'si olamaz')
  } finally {
    stub.restore()
    process.env.CRON_SECRET = savedSecret
    if (savedHook !== undefined) process.env.DISCORD_WEBHOOK_URL = savedHook
    else delete process.env.DISCORD_WEBHOOK_URL
  }
})

runIfMain(suite)

export { suite }
