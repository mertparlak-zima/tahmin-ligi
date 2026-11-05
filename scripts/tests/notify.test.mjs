// #29 + #33 · lib/notify.js testleri — gece özeti: compose/parçalama/sanitize/
// idempotency/başarısız gönderim + api/notify.js yetki kapısı (offline).

import assert from 'node:assert/strict'
import { sanitizeName, dateLabel, standingsTable, packChunks, composeDigestParts, runNightlyNotify } from '../../lib/notify.js'
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
  // T2 #34: URL şeması/www öneki düşer — isim alanı herkese açık, isim
  // Discord'da tıklanabilir link olarak çıkmasın.
  assert.equal(sanitizeName('https://phish.example'), 'phish.example')
  assert.equal(sanitizeName('www.phish.example'), 'phish.example')
  assert.equal(sanitizeName('http://a.b'), 'a.b')
  assert.equal(sanitizeName('https://'), '?')
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

suite.test('standingsTable: monospace hizalı tablo; uzun isim kırpılır; emoji yok', () => {
  const rows = [
    { name: 'Çok Uzun Oyuncu Adı Deneme Numarası', points: 12 },
    { name: 'Ada', points: 3 },
  ]
  const table = standingsTable(rows)
  const lines = table.split('\n')
  assert.equal(lines[0], '```', 'tablo kod bloğu içinde')
  assert.equal(lines[lines.length - 1], '```', 'fence dengeli kapanır')
  const body = lines.slice(1, -1)
  assert.equal(new Set(body.map(l => l.length)).size, 1, 'tüm satırlar eşit genişlikte (hiza)')
  assert.ok(body[0].includes('Oyuncu') && body[0].endsWith('Puan'), 'başlık satırı: # Oyuncu Puan')
  assert.ok(body[2].includes('…'), 'uzun isim MAX sütunda kırpılır')
  assert.ok(!table.includes('✅') && !table.includes('❌') && !table.includes('📊'), 'blok içinde emoji yok (hiza)')
  assert.equal(standingsTable([]), '', 'boş puan durumu tablo üretmez')
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
  // #33 biçimi: lig başına bölüm başlığı; oyuncular alt alta puansız;
  // puan durumu kod bloğu tablo; sonda masked link.
  assert.ok(text.startsWith('🏟 Tahmin Ligi · Süper Lig · '), 'ilk bölüm başlığı: lig adı + tarih (m1 erken)')
  assert.ok(text.includes('🏟 Tahmin Ligi · Avrupa · '), 'her ligin kendi bölüm başlığı')
  assert.ok(text.includes('Galatasaray 3-1 Samsunspor'))
  assert.ok(text.includes('✅ Ogün\n❌ Mert'), 'sonuçlar alt alta, doğru önce')
  assert.ok(!text.includes('+1') && !text.includes('❌ 0'), 'puan eki yazılmaz (#33)')
  assert.ok(text.includes('Beşiktaş 1-1 Lyon (ŞL)'), 'UEFA maçı kısa etiket taşır')
  assert.ok(!text.includes('Eski'), 'pasif oyuncunun tahmini satırda yok')
  assert.ok(!text.includes('Konyaspor'), 'tahminsiz maç özette yok')
  assert.ok(!text.includes('Fenerbahçe'), 'canlı maç özette yok')
  assert.ok(text.includes('📊 Süper Lig Puan Durumu'))
  assert.match(text, /# {2}Oyuncu {2,}Puan/, 'tablo başlık satırı hizalı')
  assert.match(text, /1 {2}Ogün {2,}2/, 'TSL tablosu: Ogün 2 (m1 doğru + flagli m5 doğru)')
  assert.match(text, /2 {2}Mert {2,}0/, 'TSL tablosu: Mert 0')
  assert.ok(text.includes('📊 Avrupa Puan Durumu'))
  assert.match(text, /1 {2}Ogün {2,}1/, 'EU tablosu: Ogün 1 (m2 beraberlik doğru)')
  const fences = (text.match(/```/g) ?? []).length
  assert.equal(fences % 2, 0, 'kod bloğu fence\'leri dengeli')
  assert.ok(text.includes('🔗 [tahmin-ligi-one.vercel.app](https://tahmin-ligi-one.vercel.app)'), 'tıklanabilir site linki (öntanımlı)')
  // Hiçbir şey yazılmadı:
  const { data: flags } = await sup.from('match_notifications').select('match_id')
  assert.deepEqual(flags.map(f => f.match_id).sort(), ['m5'])
})

suite.test('siteUrl: opts linki özelleştirir; https dışı URL düz metin düşer', async () => {
  const sup = seedSupabase()
  const custom = await runNightlyNotify(sup, { dry: true, siteUrl: 'https://ornek.example/lige-gir' })
  assert.ok(custom.chunks.some(c => c.includes('🔗 [ornek.example/lige-gir](https://ornek.example/lige-gir)')), 'masked link özelleşir')
  const plain = await runNightlyNotify(sup, { dry: true, siteUrl: 'http://guvensiz.example' })
  assert.ok(plain.chunks.some(c => c.includes('🔗 http://guvensiz.example') && !c.includes('[guvensiz')), 'https olmayan URL masked link olmaz')
  // T2 #34: markdown kırıcı parantezli URL masked link olmaz; boş görünen metin düşmez
  const brackets = await runNightlyNotify(sup, { dry: true, siteUrl: 'https://x.example/a)b' })
  assert.ok(brackets.chunks.some(c => c.includes('🔗 https://x.example/a)b') && !c.includes('[x.example')), 'parantezli URL düz metin kalır')
  const emptyHost = await runNightlyNotify(sup, { dry: true, siteUrl: 'https://' })
  assert.ok(emptyHost.chunks.some(c => c.includes('🔗 https://')), 'boş görünen metin masked link olmaz')
})

suite.test('composeDigestParts: bölüm başlığı ilk maç bloğuna yapışık (ayrı parça değil)', () => {
  const parts = composeDigestParts({
    pending: [matches[0]],
    allFinished: [matches[0]],
    players,
    predictions,
    scoring: { correctOutcome: 1 },
  })
  const first = parts[0]
  assert.ok(first.text.startsWith('🏟 Tahmin Ligi · Süper Lig · '), 'başlık ilk maç bloğunun içinde')
  assert.deepEqual(first.matchIds, [matches[0].id], 'başlık taşıyan blok maç flag\'ini taşır')
  assert.ok(!parts.some(p => p.matchIds.length === 0 && p.text.startsWith('🏟')), 'kopuk başlık parçası yok')
})

suite.test('composeDigestParts: aynı doğruluk grubunda Türkçe alfabetik eşitlik bozma', () => {
  const match = { id: 'mx', league: 'TSL', season_year: 2026, competition: 'TSL', kickoff: iso(now - hour), status: 'FINISHED', home_name: 'Galatasaray', home_short: 'Galatasaray', away_name: 'Konyaspor', away_short: 'Konyaspor', home_score: 2, away_score: 0 }
  const tiePlayers = [
    { id: 't1', name: 'Mert', is_active: true },
    { id: 't2', name: 'Ahmet', is_active: true },
    { id: 't3', name: 'Ogün', is_active: true },
  ]
  const tiePreds = [
    { player_id: 't1', match_id: 'mx', outcome: 'A' }, // yanlış
    { player_id: 't2', match_id: 'mx', outcome: 'D' }, // yanlış
    { player_id: 't3', match_id: 'mx', outcome: 'H' }, // doğru
  ]
  const parts = composeDigestParts({ pending: [match], allFinished: [match], players: tiePlayers, predictions: tiePreds, scoring: { correctOutcome: 1 } })
  const lines = parts[0].text.split('\n')
  assert.equal(lines[2], '✅ Ogün', 'doğrular önce')
  assert.equal(lines[3], '❌ Ahmet', 'yanlışlar Türkçe alfabetik: Ahmet')
  assert.equal(lines[4], '❌ Mert', 'yanlışlar Türkçe alfabetik: Mert sonra')
})

suite.test('packChunks: bölünmüş her mesajda fence dengesi korunur (tablo asla ikiye ayrılmaz)', () => {
  const parts = composeDigestParts({
    pending: [matches[0], matches[1]], // iki lig → iki tablo
    allFinished: matches,
    players,
    predictions,
    scoring: { correctOutcome: 1 },
  })
  const chunks = packChunks(parts, 120) // agresif bölme
  assert.ok(chunks.length >= 3, 'küçük sınır çok parça üretir')
  for (const chunk of chunks) {
    assert.equal((chunk.text.match(/```/g) ?? []).length % 2, 0, 'her mesajda fence dengeli')
  }
  const tableParts = parts.filter(p => p.text.includes('```'))
  assert.equal(tableParts.length, 2, 'iki ligin tablosu ayrı parçada')
  for (const part of tableParts) {
    assert.equal((part.text.match(/```/g) ?? []).length, 2, 'her tablo tek parçada ve kapalı')
    assert.deepEqual(part.matchIds, [], 'tablo parçası maç flag\'i taşımaz')
  }
})

suite.test('kısmi teslim: 2. mesaj başarısızsa yalnız TESLİM EDİLEN parçanın maçları flaglenir', async () => {
  const many = Array.from({ length: 70 }, (_, i) => ({
    id: `b${i}`, league: 'TSL', season_year: 2026, competition: 'TSL',
    kickoff: iso(now - (i + 1) * hour), status: 'FINISHED',
    home_name: `Ev Sahibi Takım ${i}`, home_short: `Ev ${i}`,
    away_name: `Deplasman Takımı ${i}`, away_short: `Deplasman ${i}`,
    home_score: 2, away_score: 1,
  }))
  const manyPreds = many.map(m => ({ player_id: 'p1', match_id: m.id, outcome: 'H' }))
  const sup = createMemorySupabase({
    players: [players[0], players[1]],
    matches: many,
    predictions: manyPreds,
    match_notifications: [],
  })
  const sent = []
  const result = await runNightlyNotify(sup, {
    webhookUrl: 'http://discord.test/hook',
    send: async (_url, content) => {
      sent.push(content)
      if (sent.length === 2) throw new Error('Discord webhook 429')
    },
  })
  assert.equal(result.sent, true, 'ilk parça gitti → kısmi teslim')
  assert.ok(result.messageCount >= 2, 'özet çok mesaja bölündü')
  assert.ok(result.error, 'hata raporlandı')
  assert.ok(result.deliveredCount > 0 && result.deliveredCount < result.pendingCount, 'kısmi teslim sayısı')
  const { data: flags } = await sup.from('match_notifications').select('match_id')
  assert.equal(flags.length, result.deliveredCount, 'yalnız teslim edilen parçanın maçları flaglendi')
  for (const chunk of sent) {
    assert.equal((chunk.match(/```/g) ?? []).length % 2, 0, 'gönderilen mesajlarda fence dengeli')
  }
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
