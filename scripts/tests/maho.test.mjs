// /maho · lib/maho.js + api/maho.js testleri — gizli sohbet relay'ı:
// doğrulama/normalizasyon, ön eksiz payload (mention parse kapalı, username
// override yalnız ad varken), rate limit penceresi, Discord başarısızlığında
// kayıt YOK, api ucu (demo enjeksiyonlu) çevrimdiren.

import assert from 'node:assert/strict'
import { POST as mahoPOST } from '../../api/maho.js'
import {
  validateText,
  normalizeName,
  buildDiscordPayload,
  createRateLimiter,
  sendMahoMessage,
} from '../../lib/maho.js'
import { createSuite, createMemorySupabase, runIfMain } from './helpers.mjs'

const suite = createSuite('/maho · lib/maho.js — gizli sohbet relay')

// --- validateText ---

suite.test('validateText: boşluk/boş → hata', () => {
  assert.equal(validateText('').ok, false)
  assert.equal(validateText('   \n\t  ').ok, false)
  assert.equal(validateText(null).ok, false)
  assert.equal(validateText(undefined).ok, false)
  assert.ok(validateText('').error.includes('boş'))
})

suite.test('validateText: kontrol/zero-width karakter düşer, \\n kalır', () => {
  const r = validateText('satır\u00001\u2028x\u200B\uFEFF\n\r\nikinci')
  // \u2028/\r de kontrol aralığında: \r düşer ama \n korunur
  assert.equal(r.ok, true)
  assert.equal(r.text.includes('\u0000'), false)
  assert.equal(r.text.includes('\u200B'), false)
  assert.ok(r.text.includes('\nikinci'))
})

suite.test('validateText: 2000 sınırı', () => {
  assert.equal(validateText('a'.repeat(2000)).ok, true)
  assert.equal(validateText(`a`.repeat(2000) + '!').ok, false)
  assert.ok(validateText('a'.repeat(2001)).error.includes('2000'))
})

// --- normalizeName ---

suite.test('normalizeName: boşluklar iner, 80 kr kırpılır, boş → ""', () => {
  assert.equal(normalizeName('  Ahmet   Yılmaz  '), 'Ahmet Yılmaz')
  assert.equal(normalizeName('x'.repeat(100)).length, 80)
  assert.equal(normalizeName('    '), '')
  assert.equal(normalizeName(undefined), '')
  assert.equal(normalizeName(null), '')
})

// --- buildDiscordPayload ---

suite.test('buildDiscordPayload: mesaj ÖN EKSİZ, mention parse kapalı', () => {
  const p = buildDiscordPayload('selam @everyone', '')
  assert.deepEqual(Object.keys(p).sort(), ['allowed_mentions', 'content'])
  assert.equal(p.content, 'selam @everyone') // gövdeye HİÇBİR önek eklenmez
  assert.deepEqual(p.allowed_mentions, { parse: [] })
})

suite.test('buildDiscordPayload: ad varsa username override, yoksa alan yok', () => {
  assert.equal(buildDiscordPayload('m', 'Maho').username, 'Maho')
  assert.equal('username' in buildDiscordPayload('m', ''), false)
})

// --- createRateLimiter ---

suite.test('createRateLimiter: pencere dolunca ret, pencere geçince reset', () => {
  let t = 0
  const rl = createRateLimiter({ max: 3, windowMs: 1000, now: () => t })
  assert.equal(rl.take('ip1').ok, true)
  assert.equal(rl.take('ip1').ok, true)
  assert.equal(rl.take('ip1').ok, true)
  const blocked = rl.take('ip1')
  assert.equal(blocked.ok, false)
  assert.equal(blocked.retryAfterMs, 1000) // ilk vuruşın pencere sonu
  // Anahtar ayrımı: başka IP etkilenmez
  assert.equal(rl.take('ip2').ok, true)
  // Pencere geçti → yine alınır
  t = 1001
  assert.equal(rl.take('ip1').ok, true)
})

// --- sendMahoMessage (enjekte edilen send ile, ağ yok) ---

const spySend = calls => async (url, payload) => {
  calls.push({ url, payload })
}

suite.test('sendMahoMessage: gönderir + manual_messages yazar', async () => {
  const sup = createMemorySupabase()
  const calls = []
  const res = await sendMahoMessage(sup, {
    text: 'maç başlıyo',
    name: ' Maho ',
    webhookUrl: 'https://discord.test/hook',
    send: spySend(calls),
  })
  assert.deepEqual(res, { ok: true, stored: true })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].payload.content, 'maç başlıyo')
  assert.equal(calls[0].payload.username, 'Maho')
  const rows = sup.store.manual_messages
  assert.equal(rows.length, 1)
  assert.equal(rows[0].text, 'maç başlıyo')
  assert.equal(rows[0].name, 'Maho')
})

suite.test('sendMahoMessage: adsız → satırda name yok, payloadta username yok', async () => {
  const sup = createMemorySupabase()
  const calls = []
  await sendMahoMessage(sup, { text: 'anon', name: '   ', webhookUrl: 'u', send: spySend(calls) })
  assert.equal('username' in calls[0].payload, false)
  assert.equal('name' in sup.store.manual_messages[0], false)
})

suite.test('sendMahoMessage: Discord hatası → kayıt YOK, hata yükselir', async () => {
  const sup = createMemorySupabase()
  const failing = async () => {
    throw new Error('Discord webhook 500')
  }
  await assert.rejects(
    () => sendMahoMessage(sup, { text: 'x', name: '', webhookUrl: 'u', send: failing }),
    /Discord webhook 500/,
  )
  assert.equal(sup.store.manual_messages.length, 0)
})

suite.test('sendMahoMessage: kayıt hatası teslifi bozmaz (stored:false)', async () => {
  // insert hep hata dönen minimal sahte istemci — mesaj Discord'a DÜŞTÜ,
  // kullanıcıya başarısız görünmemeli.
  const fake = { from: () => ({ insert: async () => ({ error: { message: 'db down' } }) }) }
  const res = await sendMahoMessage(fake, { text: 'yine de gitti', name: '', webhookUrl: 'u', send: spySend([]) })
  assert.deepEqual(res, { ok: true, stored: false })
})

suite.test('sendMahoMessage: geçersiz metin err.status=400', async () => {
  await assert.rejects(
    () => sendMahoMessage(createMemorySupabase(), { text: '  ', name: '', webhookUrl: 'u' }),
    err => err.status === 400,
  )
})

// --- api/maho.js POST (demo supabase enjeksiyonlu — webhook env gerektirmez) ---

const apiReq = (body, ip) => {
  const req = new Request('http://localhost:8787/api/maho', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(ip ? { 'x-forwarded-for': ip } : {}),
    },
    body: JSON.stringify(body),
  })
  req.supabase = createMemorySupabase()
  return req
}

suite.test('api POST: demo akışı 200 + kayıt (anonim, adlı)', async () => {
  const anon = await mahoPOST(apiReq({ text: 'anon mesaj', name: '' }, '10.0.0.1'))
  assert.equal(anon.status, 200)
  assert.equal((await anon.json()).ok, true)

  const named = await mahoPOST(apiReq({ text: 'adlı mesaj', name: 'Maho' }, '10.0.0.2'))
  assert.equal(named.status, 200)
  assert.equal((await named.json()).stored, true)
})

suite.test('api POST: boş/uzun metin → 400 (Türkçe)', async () => {
  const empty = await mahoPOST(apiReq({ text: '   ' }, '10.0.0.3'))
  assert.equal(empty.status, 400)
  assert.ok((await empty.json()).error.includes('boş'))

  const long = await mahoPOST(apiReq({ text: 'a'.repeat(2001) }, '10.0.0.3'))
  assert.equal(long.status, 400)
  assert.ok((await long.json()).error.includes('2000'))
})

suite.test('api POST: geçersiz JSON gövde → 400', async () => {
  const req = new Request('http://localhost:8787/api/maho', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.4' },
    body: '{bozuk',
  })
  req.supabase = createMemorySupabase()
  const res = await mahoPOST(req)
  assert.equal(res.status, 400)
})

suite.test('api POST: rate limit → 429 (8/30 sn/IP)', async () => {
  const ip = '10.9.9.9'
  for (let i = 0; i < 8; i += 1) {
    const res = await mahoPOST(apiReq({ text: `spam ${i}` }, ip))
    assert.equal(res.status, 200)
  }
  const blocked = await mahoPOST(apiReq({ text: 'dokuzuncu' }, ip))
  assert.equal(blocked.status, 429)
  assert.ok((await blocked.json()).error.includes('saniye'))
  // Başka IP etkilenmez
  const other = await mahoPOST(apiReq({ text: 'baska ip' }, '10.8.8.8'))
  assert.equal(other.status, 200)
})

await runIfMain(suite)
export { suite }
