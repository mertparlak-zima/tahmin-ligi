// A · lib/espn.js normalizer testleri — tamamen offline (fetch stub).
// Kullanım: node scripts/tests/espn.test.mjs (veya server.test.mjs ile birlikte)

import assert from 'node:assert/strict'
import { fetchTrackedMatches, seasonYear } from '../../lib/espn.js'
import { createSuite, espnEvent, hour, iso, runIfMain, withStubbedFetch } from './helpers.mjs'

const suite = createSuite('A · lib/espn.js')

// Sabit "şimdi": Ekim 2026 → sezonYear 2026 → URL'ler dates=2026/2027 deterministik.
const NOW = new Date('2026-10-24T12:00:00Z')
const SY = 2026
const CL26 = 'uefa.champions/scoreboard?dates=2026'
const CL27 = 'uefa.champions/scoreboard?dates=2027'

const gsHome = { displayName: 'Galatasaray SK', shortDisplayName: 'Galatasaray', tla: 'GS' }
const barcaAway = { displayName: 'Barcelona', shortDisplayName: 'Barça', tla: 'BAR' }

async function fetchWith(routes) {
  const stub = withStubbedFetch(routes)
  try {
    return await fetchTrackedMatches(NOW)
  } finally {
    stub.restore()
  }
}

const trackedEvent = overrides =>
  espnEvent({
    id: 100,
    date: iso(Date.parse('2026-10-20T18:45:00Z')),
    seasonYear: SY,
    home: gsHome,
    away: barcaAway,
    ...overrides,
  })

// --- sezon yılı ---

suite.test('seasonYear: Temmuz+ aynı yıl, öncesi bir önceki yıl', () => {
  assert.equal(seasonYear(new Date('2026-01-15T00:00:00Z')), 2025, 'Ocak → önceki yıl')
  assert.equal(seasonYear(new Date('2026-06-30T23:59:59Z')), 2025, 'Haziran sonu → önceki yıl')
  assert.equal(seasonYear(new Date('2026-07-01T00:00:00Z')), 2026, 'Temmuz başı → aynı yıl')
  assert.equal(seasonYear(new Date('2026-10-24T12:00:00Z')), 2026, 'Ekim → aynı yıl')
})

// --- sezon filtresi ---

suite.test('sezon filtresi: yalnız event.season.year === seasonYear kalır', async () => {
  const result = await fetchWith([
    [CL26, {
      events: [
        trackedEvent({ id: 1, seasonYear: 2025 }), // geçen sezon → atılmalı
        trackedEvent({ id: 2, seasonYear: 2027 }), // gelecek sezon → atılmalı
        trackedEvent({ id: 3, seasonYear: 2026 }), // bu sezon → kalmalı
      ],
    }],
  ])
  assert.equal(result.matches.length, 1, 'tek maç kalmalı')
  assert.equal(result.matches[0].externalId, '3')
})

suite.test('iki yıl taramasında aynı id deduplanır', async () => {
  const dupe = trackedEvent({ id: 900 })
  const result = await fetchWith([
    [CL26, { events: [dupe] }],
    [CL27, { events: [trackedEvent({ id: 900, date: iso(Date.parse('2026-11-03T20:00:00Z')) })] }],
  ])
  assert.equal(result.matches.length, 1, 'aynı event iki yılda da dönerse tek kayıt')
  assert.equal(result.matches[0].externalId, '900')
})

// --- durum eşlemesi ---

suite.test('durum eşlemesi: ESPN durum adları taksonomiye çevrilir', async () => {
  const cases = [
    ['STATUS_POSTPONED', 'pre', true, 'POSTPONED'],
    ['STATUS_CANCELED', 'pre', true, 'CANCELLED'],
    ['STATUS_CANCELLED', 'pre', true, 'CANCELLED'],
    ['STATUS_SUSPENDED', 'pre', true, 'SUSPENDED'],
    ['STATUS_FINAL', 'post', true, 'FINISHED'],
    ['STATUS_FULL_TIME', 'post', true, 'FINISHED'],
    ['STATUS_HALFTIME', 'in', true, 'PAUSED'],
    ['STATUS_IN_2', 'in', true, 'IN_PLAY'],
    ['STATUS_SCHEDULED', 'pre', false, 'SCHEDULED'],
    ['STATUS_SCHEDULED', 'pre', true, 'TIMED'],
  ]
  for (const [name, state, timeValid, expected] of cases) {
    const result = await fetchWith([
      [CL26, { events: [trackedEvent({ id: 50, statusName: name, state, timeValid })] }],
    ])
    assert.equal(result.matches.length, 1, `${name}: maç üretilmeli`)
    assert.equal(result.matches[0].status, expected, `${name}/${state} → ${expected}`)
  }
})

// --- skor çözümleme ---

suite.test('skor çözümleme: displayValue, value, sayı, ""/"-" → null', async () => {
  const cases = [
    [{ displayValue: '2', value: 99 }, 2, 'displayValue öncelikli'],
    [{ value: 3 }, 3, 'yalnız value'],
    ['4', 4, 'string sayı'],
    [5, 5, 'sayı'],
    ['', null, 'boş string'],
    ['-', null, 'tire'],
  ]
  for (const [raw, expected, label] of cases) {
    const result = await fetchWith([
      [CL26, {
        events: [
          trackedEvent({
            id: 60,
            statusName: 'STATUS_FINAL',
            state: 'post',
            home: { ...gsHome, score: raw },
            away: { ...barcaAway, score: { displayValue: '0' } },
          }),
        ],
      }],
    ])
    assert.equal(result.matches[0].home.score, expected, `${label} → ${expected}`)
    assert.equal(result.matches[0].away.score, 0, 'string sıfır → 0')
  }
})

suite.test('skorsuz durumlar skoru zorla null yapar', async () => {
  for (const name of ['STATUS_POSTPONED', 'STATUS_SUSPENDED', 'STATUS_CANCELED']) {
    const result = await fetchWith([
      [CL26, {
        events: [
          trackedEvent({
            id: 61,
            statusName: name,
            state: 'pre',
            home: { ...gsHome, score: { displayValue: '2' } },
            away: { ...barcaAway, score: { displayValue: '1' } },
          }),
        ],
      }],
    ])
    assert.equal(result.matches[0].home.score, null, `${name}: home skoru null`)
    assert.equal(result.matches[0].away.score, null, `${name}: away skoru null`)
  }
})

// --- dakika ---

suite.test('dakika: yalnız canlı durumda çözümlenir, 130 ile sınırlanır', async () => {
  const cases = [
    ['STATUS_IN_2', 'in', "45'+2''", 'IN_PLAY', 45],
    ['STATUS_IN_2', 'in', "131'", 'IN_PLAY', 130],
    ['STATUS_HALFTIME', 'in', "45'", 'PAUSED', 45],
    ['STATUS_FINAL', 'post', "90'", 'FINISHED', null],
    ['STATUS_SCHEDULED', 'pre', '', 'TIMED', null],
  ]
  for (const [name, state, clock, status, expected] of cases) {
    const result = await fetchWith([
      [CL26, { events: [trackedEvent({ id: 62, statusName: name, state, clock })] }],
    ])
    assert.equal(result.matches[0].status, status)
    assert.equal(result.matches[0].minute, expected, `${status} + "${clock}" → ${expected}`)
  }
})

// --- takip filtresi + kanonik adlar ---

suite.test('takip filtresi: yalnız 4 büyükler maçları izlenir, adlar kanonikleşir', async () => {
  const result = await fetchWith([
    [CL26, {
      events: [
        espnEvent({
          id: 71, seasonYear: SY, date: iso(Date.parse('2026-10-20T18:45:00Z')),
          statusName: 'STATUS_SCHEDULED', state: 'pre',
          home: { displayName: 'Barcelona', shortDisplayName: 'Barça' },
          away: { displayName: 'Lyon', shortDisplayName: 'Lyon' },
        }), // takip dışı → atılmalı
        espnEvent({
          id: 72, seasonYear: SY, date: iso(Date.parse('2026-10-21T18:45:00Z')),
          statusName: 'STATUS_SCHEDULED', state: 'pre',
          home: { displayName: 'Fenerbahce SK', shortDisplayName: 'Fenerbahce' },
          away: { displayName: 'Lyon', shortDisplayName: 'Lyon' },
        }),
        espnEvent({
          id: 73, seasonYear: SY, date: iso(Date.parse('2026-10-22T18:45:00Z')),
          statusName: 'STATUS_SCHEDULED', state: 'pre',
          home: { displayName: 'Besiktas JK', shortDisplayName: 'Besiktas' },
          away: { displayName: 'Malmö FF', shortDisplayName: 'Malmö' },
        }),
        espnEvent({
          id: 74, seasonYear: SY, date: iso(Date.parse('2026-10-23T18:45:00Z')),
          statusName: 'STATUS_SCHEDULED', state: 'pre',
          home: { displayName: 'Trabzon Karadenizspor', shortDisplayName: 'Karadeniz' },
          away: { displayName: 'Rijeka', shortDisplayName: 'Rijeka' },
        }), // benzer ad → takip dışı
        espnEvent({
          id: 75, seasonYear: SY, date: iso(Date.parse('2026-10-19T18:45:00Z')),
          statusName: 'STATUS_SCHEDULED', state: 'pre',
          home: gsHome,
          away: barcaAway,
        }),
      ],
    }],
  ])

  assert.equal(result.matches.length, 3, 'GS/FB/BJK maçları kalır, diğerleri atılır')
  assert.deepEqual(
    result.matches.map(m => m.externalId),
    ['75', '72', '73'],
    'kickoff artan sırayla',
  )

  const fb = result.matches.find(m => m.externalId === '72')
  assert.equal(fb.home.name, 'Fenerbahçe', 'ad kanonik Türkçe')
  assert.equal(fb.home.short, 'Fenerbahçe', 'kısa ad da kanonik Türkçe')
  assert.equal(fb.away.name, 'Lyon', 'takip dışı taraf olduğu gibi kalır')

  const bjk = result.matches.find(m => m.externalId === '73')
  assert.equal(bjk.home.name, 'Beşiktaş')
  assert.equal(bjk.home.short, 'Beşiktaş')
})

// --- #21 Süper Lig kaynağı (tur.1) ---

const TUR1 = 'tur.1/scoreboard'

const tslEvent = (id, dayMs, homeName, awayName) => espnEvent({
  id,
  seasonYear: SY,
  date: iso(Date.parse(dayMs)),
  week: null, // tur.1'de week boş gelir → matchday null (kolon nullable)
  statusName: 'STATUS_SCHEDULED',
  state: 'pre',
  home: { displayName: homeName, shortDisplayName: homeName },
  away: { displayName: awayName, shortDisplayName: awayName },
})

suite.test('#21 TSL: tur.1 TÜM maçları gelir (takım filtresi yok), kod TSL', async () => {
  const stub = withStubbedFetch([
    [TUR1, {
      events: [
        tslEvent(201, '2026-10-16T16:00:00Z', 'Samsunspor', 'Konyaspor'), // takipsiz × takipsiz
        tslEvent(202, '2026-10-17T16:00:00Z', 'Istanbul Basaksehir', 'Galatasaray SK'),
        tslEvent(203, '2026-10-18T16:00:00Z', 'Antalyaspor', 'Goztepe'),
      ],
    }],
  ])
  try {
    const result = await fetchTrackedMatches(NOW, { league: 'TSL' })
    assert.equal(result.matches.length, 3, 'TSL maçlarında takım filtresi YOK — hepsi kalır')
    assert.ok(result.matches.every(m => m.competitionCode === 'TSL'), 'competitionCode TSL')
    assert.ok(result.matches.every(m => m.matchday === null), 'week boş → matchday null')
    assert.equal(result.matches.find(m => m.externalId === '202').away.name, 'Galatasaray', 'kanonik ad TSL tarafında da korunur')
    assert.equal(result.matches.find(m => m.externalId === '201').away.name, 'Konyaspor', 'takip dışı ad olduğu gibi kalır')
    assert.equal(result.complete, true)
    // TSL turu yalnız tur.1 kaynağını okur: tek slug × 2 yıl, UEFA istenmez.
    assert.equal(stub.calls.length, 2)
    assert.ok(stub.calls.every(u => u.includes('tur.1/')), 'UEFA slug\'ları hiç çağrılmaz')
  } finally {
    stub.restore()
  }
})

suite.test('#21 TSL: bilinmeyen lig kodu fetch\'i reddeder', async () => {
  await assert.rejects(
    () => fetchTrackedMatches(NOW, { league: 'XX' }),
    /Bilinmeyen lig/,
  )
})

suite.test('#21 EU (varsayılan): tur.1 kaynağı okunmaz', async () => {
  const stub = withStubbedFetch([])
  try {
    await fetchTrackedMatches(NOW) // league verilmeyince EU
    assert.equal(stub.calls.length, 6, '3 UEFA slug × 2 yıl')
    assert.ok(stub.calls.every(u => u.includes('uefa.')), 'EU turu UEFA kaynaklarıyla sınırlı')
  } finally {
    stub.restore()
  }
})

// --- complete bayrağı ---

suite.test('bir kaynak hata verirse complete=false, maçlar yine döner', async () => {
  const result = await fetchWith([
    [CL26, { events: [trackedEvent({ id: 81 })] }],
    [CL27, { events: [trackedEvent({ id: 82, date: iso(Date.parse('2026-11-01T20:00:00Z')) })] }],
    ['uefa.europa/scoreboard?dates=2026', new Error('kaynak kapandı')],
  ])
  assert.equal(result.matches.length, 2)
  assert.equal(result.complete, false, 'hatalı kaynak → complete=false')
  assert.equal(result.errors.length, 1)
  assert.match(result.errors[0], /uefa\.europa.*kaynak kapandı/)
})

suite.test('sıfır takip edilen maç → complete=false', async () => {
  const result = await fetchWith([]) // tüm rotalar boş { events: [] }
  assert.equal(result.matches.length, 0)
  assert.equal(result.complete, false, 'maç yokken complete=false (prune güvenliği)')
  assert.equal(result.errors.length, 0)
})

suite.test('tüm kaynaklar sağlam + maç var → complete=true', async () => {
  const result = await fetchWith([[CL26, { events: [trackedEvent({ id: 83 })] }]])
  assert.equal(result.matches.length, 1)
  assert.equal(result.complete, true)
  assert.equal(result.errors.length, 0)
})

await runIfMain(suite)
export { suite }
