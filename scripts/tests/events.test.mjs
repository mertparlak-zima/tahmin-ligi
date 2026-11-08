// H · lib/events.js + api/events.js testleri — İşlem Geçmişi (#40):
// maskeleme, UA parse, istek meta'sı, no-op filtresi, best-effort kayıt,
// payload join'i ve TAM IP SIZMA denetimi.

import assert from 'node:assert/strict'
import { GET as eventsGET } from '../../api/events.js'
import {
  maskIp,
  parseUserAgent,
  requestMetaOf,
  deriveEvents,
  recordPredictionEvents,
  buildEventsPayload,
} from '../../lib/events.js'
import { createMemorySupabase, createSuite, hour, iso, runIfMain } from './helpers.mjs'

const suite = createSuite('H · lib/events.js (İşlem Geçmişi #40)')

const now = Date.now()

// --- maskIp ---

suite.test('maskIp: IPv4 ilk 2 oktet açık, gerisi yıldız', () => {
  assert.equal(maskIp('85.110.56.201'), '85.110.••.••')
  assert.equal(maskIp('192.168.1.1'), '192.168.••.••')
})

suite.test('maskIp: IPv6 ilk 2 grup açık; ::ffff: eşlenmişi IPv4 gibi', () => {
  assert.equal(maskIp('2001:db8::1'), '2001:db8:••:••')
  assert.equal(maskIp('::ffff:85.110.56.201'), '85.110.••.••')
})

suite.test('maskIp: çözümlenemeyen ve boş girdiler', () => {
  assert.equal(maskIp('vercel-edge'), '••')
  assert.equal(maskIp(''), null)
  assert.equal(maskIp(null), null)
})

// --- parseUserAgent ---

suite.test('parseUserAgent: tarayıcı/OS/cihaz üçlüsü', () => {
  const chromeWin = parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36')
  assert.equal(chromeWin.browser, 'Chrome')
  assert.equal(chromeWin.os, 'Windows')
  assert.equal(chromeWin.device, 'Masaüstü')

  const safariPhone = parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 20_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/20.0 Mobile/15E148 Safari/604.1')
  assert.equal(safariPhone.browser, 'Safari')
  assert.equal(safariPhone.os, 'iOS')
  assert.equal(safariPhone.device, 'Telefon')

  const edge = parseUserAgent('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0')
  assert.equal(edge.browser, 'Edge', 'Chrome alt stringi Edg/ tarafından ezilmeli')

  const ffLinux = parseUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0')
  assert.equal(ffLinux.browser, 'Firefox')
  assert.equal(ffLinux.os, 'Linux')

  assert.equal(parseUserAgent(''), null)
  assert.equal(parseUserAgent(null), null)
})

// --- requestMetaOf ---

const reqWith = headers => {
  const req = new Request('http://localhost:8787/api/predictions', { method: 'PUT' })
  for (const [k, v] of Object.entries(headers)) req.headers.set(k, v)
  return req
}

suite.test('requestMetaOf: x-real-ip önceliği + XFF SON girdi (maho clientKey deseni)', () => {
  const meta = requestMetaOf(reqWith({
    'x-real-ip': '85.110.56.201',
    'x-forwarded-for': '1.1.1.1, 2.2.2.2',
  }))
  assert.equal(meta.ip, '85.110.56.201')

  const metaFwd = requestMetaOf(reqWith({ 'x-forwarded-for': '1.1.1.1, 85.110.56.201' }))
  assert.equal(metaFwd.ip, '85.110.56.201', 'XFF zincirinin SON girdisi')

  const metaNone = requestMetaOf(reqWith({}))
  assert.equal(metaNone.ip, null, 'yerel dev — başlık yok')
})

suite.test('requestMetaOf: Vercel konum başlıkları + UA taşınır', () => {
  const meta = requestMetaOf(reqWith({
    'x-real-ip': '85.110.56.201',
    'x-vercel-ip-city': '%C4%B0stanbul',
    'x-vercel-ip-country': 'TR',
    'x-vercel-ip-country-region': '34',
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 20_1) Safari/604.1',
  }))
  assert.equal(meta.ipCity, 'İstanbul', 'URL-encoded şehir adı çözülür')
  assert.equal(meta.ipCountry, 'TR')
  assert.equal(meta.ipRegion, '34')
  assert.ok(meta.userAgent.startsWith('Mozilla/5.0 (iPhone'))
})

// --- deriveEvents (saf çekirdek) ---

const META = { ip: '85.110.56.201', ipCity: 'İstanbul', ipCountry: 'TR', ipRegion: '34', userAgent: 'UA-Test/1.0' }

suite.test('deriveEvents: CREATE / UPDATE / DELETE / no-op', () => {
  const oldByMatch = new Map([
    ['m-same', 'H'],
    ['m-chg', 'A'],
    ['m-del', 'D'],
  ])
  const rows = deriveEvents({
    items: [
      { matchId: 'm-new', outcome: 'H' },      // satır yok → CREATE
      { matchId: 'm-chg', outcome: 'H' },      // A→H → UPDATE
      { matchId: 'm-same', outcome: 'H' },     // H→H → NO-OP
      { matchId: 'm-del', outcome: '' },       // D → DELETE
      { matchId: 'm-ghost', outcome: '' },     // satır yok → silme no-op
    ],
    oldByMatch,
    meta: META,
    playerId: 'p1',
    now,
  })
  assert.equal(rows.length, 3, "no-op'lar yazılmaz")
  const [create, update, del] = rows
  assert.equal(create.action, 'CREATE')
  assert.equal(create.old_outcome, null)
  assert.equal(create.new_outcome, 'H')
  assert.equal(update.action, 'UPDATE')
  assert.equal(update.old_outcome, 'A')
  assert.equal(update.new_outcome, 'H')
  assert.equal(del.action, 'DELETE')
  assert.equal(del.old_outcome, 'D')
  assert.equal(del.new_outcome, null)
  for (const row of rows) {
    assert.equal(row.player_id, 'p1')
    assert.equal(row.ip, META.ip)
    assert.equal(row.user_agent, META.userAgent)
    assert.equal(row.ip_city, META.ipCity)
  }
})

suite.test('deriveEvents: batch içinde created_at ms başına ayrışır', () => {
  const rows = deriveEvents({
    items: [
      { matchId: 'a', outcome: 'H' },
      { matchId: 'b', outcome: 'D' },
      { matchId: 'c', outcome: 'A' },
    ],
    oldByMatch: new Map(),
    meta: META,
    now,
  })
  const stamps = rows.map(r => Date.parse(r.created_at))
  assert.ok(stamps[0] < stamps[1] && stamps[1] < stamps[2], 'artan zaman damgaları')
})

// --- recordPredictionEvents (best-effort) ---

suite.test('recordPredictionEvents: satır yazar; hata YÜKSELTMEZ', async () => {
  const sup = createMemorySupabase()
  const ok = await recordPredictionEvents(sup, reqWith({ 'x-real-ip': '85.110.56.201' }), {
    items: [{ matchId: 'm1', outcome: 'H' }],
    oldByMatch: new Map(),
    playerId: 'p1',
  })
  assert.equal(ok.written, 1)
  assert.equal(sup.store.prediction_events.length, 1)
  assert.equal(sup.store.prediction_events[0].ip, '85.110.56.201')
  assert.equal(sup.store.prediction_events[0].player_id, 'p1')

  // Patlayan insert: tahmin akışını bozmamalı.
  const broken = {
    from: () => ({
      insert: async () => ({ data: null, error: { message: 'relation yok' } }),
    }),
  }
  const fail = await recordPredictionEvents(broken, reqWith({}), {
    items: [{ matchId: 'm1', outcome: 'H' }],
    oldByMatch: new Map(),
    playerId: 'p1',
  })
  assert.equal(fail.written, 0)
  assert.ok(fail.error)
})

suite.test('recordPredictionEvents: hepsi no-op ise hiç yazmaz', async () => {
  const sup = createMemorySupabase()
  const res = await recordPredictionEvents(sup, reqWith({}), {
    items: [{ matchId: 'm1', outcome: 'H' }],
    oldByMatch: new Map([['m1', 'H']]),
    playerId: 'p1',
  })
  assert.equal(res.written, 0)
  assert.equal(sup.store.prediction_events.length, 0)
})

// --- buildEventsPayload (join + gizlilik) ---

function seededSupabase() {
  return createMemorySupabase({
    players: [{ id: 'p1', name: 'Ogün', color: '#b8f34a', is_active: true }],
    matches: [{
      id: 'm1', provider: 'espn', external_id: '1', competition: 'EL', league: 'EU',
      kickoff: iso(now + 24 * hour), status: 'TIMED',
      home_name: 'Beşiktaş', home_short: 'BJK', away_name: 'Lyon', away_short: 'Lyon',
      home_score: null, away_score: null, season_year: 2026,
    }],
    prediction_events: [
      {
        id: 2, player_id: 'p1', match_id: 'm1', action: 'UPDATE',
        old_outcome: 'A', new_outcome: 'H',
        ip: '85.110.56.201', ip_city: 'İstanbul', ip_country: 'TR', ip_region: '34',
        user_agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0',
        created_at: iso(now - hour),
      },
      {
        id: 1, player_id: 'p1', match_id: 'm1', action: 'CREATE',
        old_outcome: null, new_outcome: 'A',
        ip: '85.110.56.201', ip_city: 'İstanbul', ip_country: 'TR', ip_region: '34',
        user_agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0',
        created_at: iso(now - 2 * hour),
      },
    ],
  })
}

suite.test('buildEventsPayload: join + desc sıra + maskeli IP; TAM IP SIZMAZ', async () => {
  const payload = await buildEventsPayload(seededSupabase())
  assert.equal(payload.events.length, 2)
  const [first, second] = payload.events
  assert.equal(first.action, 'UPDATE', 'created_at desc')
  assert.equal(second.action, 'CREATE')
  assert.equal(first.player.name, 'Ogün')
  assert.equal(first.player.initials, 'O')
  assert.equal(first.match.homeShort, 'BJK')
  assert.equal(first.match.competition, 'EL')
  assert.equal(first.match.score, null, 'skorsuz maç → null')
  assert.equal(first.ipMasked, '85.110.••.••')
  assert.equal(first.ipCity, 'İstanbul')
  assert.equal(first.ua.browser, 'Chrome')
  assert.equal(first.ua.os, 'Windows')

  // GİZLİLİK: payload'ın HİÇBİR yerinde tam IP geçmemeli.
  const json = JSON.stringify(payload)
  assert.equal(json.includes('85.110.56.201'), false, 'tam IP payload dışında kalır')
  assert.equal(json.includes('ip":'), false, 'ham ip alanı yok (yalnız ipMasked)')
})

suite.test('buildEventsPayload: boş tablo → boş liste (hata değil)', async () => {
  const payload = await buildEventsPayload(createMemorySupabase())
  assert.deepEqual(payload, { events: [] })
})

// --- api GET /api/events ---

suite.test('api /api/events GET: 200 + limit sıkıştırma; yanlış yöntem 405', async () => {
  const sup = seededSupabase()
  const req = new Request('http://localhost:8787/api/events?limit=999')
  req.supabase = sup
  const res = await eventsGET(req)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.limit, 200, "limit 1..200'e sıkışır")
  assert.equal(body.eventCount, 2)

  const reqOne = new Request('http://localhost:8787/api/events?limit=1')
  reqOne.supabase = sup
  const one = await (await eventsGET(reqOne)).json()
  assert.equal(one.events.length, 1)

  const post = await eventsGET(new Request('http://localhost:8787/api/events', { method: 'POST' }))
  assert.equal(post.status, 405)
})

suite.test('api /api/events GET: tablo yoksa 503 (migration sırası)', async () => {
  const broken = {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: null, error: { message: 'relation "prediction_events" does not exist' } }),
        }),
      }),
    }),
  }
  const req = new Request('http://localhost:8787/api/events')
  req.supabase = broken
  const res = await eventsGET(req)
  assert.equal(res.status, 503)
})

await runIfMain(suite)
export { suite }
