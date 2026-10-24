// F · src/utils/calendar.js testleri — #19 ay takvimi saf yardımcı katmanı.

import assert from 'node:assert/strict'
import {
  WEEKDAY_HEADERS,
  monthKeyOf,
  parseMonthKey,
  shiftMonth,
  todayMonthKey,
  todayDayKey,
  monthTitle,
  seasonOfYearMonth,
  monthMatrix,
  abbrOfTeam,
  summarizeDay,
} from '../../src/utils/calendar.js'
import { createSuite, runIfMain } from './helpers.mjs'

const suite = createSuite('F · utils/calendar.js')

// Payload maç öğesi üreticisi (bkv. lib/league.js matchItems alanları).
const match = (id, overrides = {}) => ({
  id,
  kickoff: overrides.kickoff ?? '2026-10-22T16:00:00Z',
  status: overrides.status ?? 'TIMED',
  statusGroup: overrides.statusGroup ?? 'upcoming',
  isLive: overrides.isLive ?? false,
  isFinished: overrides.isFinished ?? false,
  isStarted: overrides.isStarted ?? false,
  minute: overrides.minute ?? null,
  score: overrides.score ?? null,
  competitionCode: overrides.competitionCode ?? 'CL',
  home: overrides.home ?? { name: 'Fenerbahçe', short: 'Fenerbahçe', tla: 'FEN' },
  away: overrides.away ?? { name: 'Roma', short: 'Roma', tla: 'ROM' },
})

suite.test('monthKeyOf: sıfır dolgulu YYYY-MM; ay taşmaları yıla devrolur', () => {
  assert.equal(monthKeyOf(2026, 9), '2026-10')
  assert.equal(monthKeyOf(2026, 0), '2026-01')
  assert.equal(monthKeyOf(2026, 11), '2026-12')
  assert.equal(monthKeyOf(2026, 12), '2027-01')
  assert.equal(monthKeyOf(2026, -1), '2025-12')
  assert.equal(monthKeyOf(2025, 13), '2026-02')
})

suite.test('parseMonthKey: geçerli anahtar {year, monthIndex}; geçersizler null', () => {
  assert.deepEqual(parseMonthKey('2026-10'), { year: 2026, monthIndex: 9 })
  assert.deepEqual(parseMonthKey('2026-01'), { year: 2026, monthIndex: 0 })
  assert.deepEqual(parseMonthKey('2026-12'), { year: 2026, monthIndex: 11 })
  for (const bad of ['2026-13', '2026-00', '2026-1', '26-10', '2026/10', '2026', ' 2026-10', '', null, undefined, 202610]) {
    assert.equal(parseMonthKey(bad), null, `parseMonthKey(${JSON.stringify(bad)})`)
  }
})

suite.test('shiftMonth: yıl devri doğru (2026-01 -1 → 2025-12)', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(shiftMonth('2025-12', 1), '2026-01')
  assert.equal(shiftMonth('2026-10', 3), '2027-01')
  assert.equal(shiftMonth('2026-07', -6), '2026-01')
  assert.equal(shiftMonth('2026-07', -7), '2025-12')
  assert.equal(shiftMonth('2026-10', 0), '2026-10')
  assert.equal(shiftMonth('2026-10', 12), '2027-10')
  assert.equal(shiftMonth('bogus', 1), null)
})

suite.test('todayMonthKey/todayDayKey: Europe/Istanbul takvimi (UTC+3 gün devri)', () => {
  // 22:30Z UTC'de hâlâ 24 Ekim; İstanbul'da 25 Ekim 01:30.
  assert.equal(todayDayKey(new Date('2026-10-24T22:30:00Z')), '2026-10-25')
  assert.equal(todayMonthKey(new Date('2026-10-24T22:30:00Z')), '2026-10')
  // Gün içinde öğlen: iki takvim de aynı gün.
  assert.equal(todayDayKey(new Date('2026-10-24T10:00:00Z')), '2026-10-24')
  // Yıl devri: 31 Aralık 21:59Z → İstanbul'da 1 Ocak.
  assert.equal(todayDayKey(new Date('2025-12-31T21:59:00Z')), '2026-01-01')
  assert.equal(todayMonthKey(new Date('2025-12-31T21:59:00Z')), '2026-01')
  assert.equal(todayMonthKey(new Date('2026-01-01T00:30:00Z')), '2026-01')
})

suite.test('seasonOfYearMonth: Temmuz+ aynı yıl, Ocak-Haziran bir önceki yıl', () => {
  assert.equal(seasonOfYearMonth(2026, 5), 2025, '2026-06 → 2025')
  assert.equal(seasonOfYearMonth(2026, 6), 2026, '2026-07 → 2026')
  assert.equal(seasonOfYearMonth(2026, 0), 2025)
  assert.equal(seasonOfYearMonth(2026, 11), 2026)
  assert.equal(seasonOfYearMonth(2027, 5), 2026)
})

suite.test('monthTitle: sabit Türkçe ay adları, büyük harf yok', () => {
  assert.equal(monthTitle('2026-10'), 'Ekim 2026')
  assert.equal(monthTitle('2026-01'), 'Ocak 2026')
  assert.equal(monthTitle('2028-02'), 'Şubat 2028')
  assert.equal(monthTitle('2026-13'), '')
})

suite.test('WEEKDAY_HEADERS: Pazartesi ilk gün Türkçe düzeni', () => {
  assert.deepEqual(WEEKDAY_HEADERS, ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'])
})

suite.test('monthMatrix: Ekim 2026 — 1\'i Perşembe; ilk satır 28 Eylül Pzt ile başlar', () => {
  const rows = monthMatrix('2026-10')
  assert.equal(rows.length, 6)
  assert.deepEqual(rows[0].slice(0, 3).map(cell => cell.dayKey), ['2026-09-28', '2026-09-29', '2026-09-30'])
  assert.ok(rows[0].slice(0, 3).every(cell => cell.inMonth === false), 'ilk 3 hücre Eylül dolgusu')
  assert.deepEqual(rows[0][3], { dayKey: '2026-10-01', day: 1, inMonth: true })
  // 1 Ekim 2026 gerçekten Perşembe → 4. sütun (Pzt=0 hizası).
  assert.equal(WEEKDAY_HEADERS[3], 'Per')
  assert.equal(new Date('2026-10-01T12:00:00Z').getUTCDay(), 4)
})

suite.test('monthMatrix: Ekim 2026 — 42 hücre, dayKey benzersiz ve artan, 31\'i ay içinde', () => {
  const cells = monthMatrix('2026-10').flat()
  assert.equal(cells.length, 42)
  assert.equal(cells.filter(cell => cell.inMonth).length, 31)
  const keys = cells.map(cell => cell.dayKey)
  assert.equal(new Set(keys).size, 42, 'dayKey benzersiz')
  for (let i = 1; i < keys.length; i++) {
    const diff = Date.parse(`${keys[i]}T12:00:00Z`) - Date.parse(`${keys[i - 1]}T12:00:00Z`)
    assert.equal(diff, 86_400_000, `${keys[i - 1]} → ${keys[i]} tam bir gün`)
  }
  assert.equal(keys[0], '2026-09-28')
  assert.equal(keys[41], '2026-11-08')
})

suite.test('monthMatrix: Şubat 2028 artık yıl — 29 gün, yine tam 6×7 ızgara', () => {
  const rows = monthMatrix('2028-02')
  const cells = rows.flat()
  assert.equal(rows.length, 6)
  assert.ok(rows.every(row => row.length === 7))
  assert.equal(cells.length, 42)
  assert.equal(cells.filter(cell => cell.inMonth).length, 29)
  assert.ok(cells.some(cell => cell.dayKey === '2028-02-29' && cell.inMonth), '29 Şubat var ve ay içinde')
  assert.equal(cells[0].dayKey, '2028-01-31', '1 Şubat 2028 Salı → satır 31 Ocak Pzt ile başlar')
  assert.equal(cells[41].dayKey, '2028-03-12')
})

suite.test('monthMatrix: 2025-2029 her ay 6×7, sütunlar Pzt..Paz hizalı, gün sayısı doğru', () => {
  for (let year = 2025; year <= 2029; year++) {
    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
      const rows = monthMatrix(monthKeyOf(year, monthIndex))
      assert.equal(rows.length, 6, `${year}-${monthIndex + 1} 6 satır`)
      assert.ok(rows.every(row => row.length === 7), `${year}-${monthIndex + 1} satırlar 7 hücre`)
      const cells = rows.flat()
      assert.equal(cells.length, 42)
      // Ay uzunluğu referansı: bir sonraki ayın 0. günü (UTC — 12:00 kurulumuyla aynı takvim).
      const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
      assert.equal(
        cells.filter(cell => cell.inMonth).length,
        daysInMonth,
        `${year}-${monthIndex + 1} ${daysInMonth} gün`,
      )
      for (let rowIdx = 0; rowIdx < 6; rowIdx++) {
        for (let colIdx = 0; colIdx < 7; colIdx++) {
          const cell = rows[rowIdx][colIdx]
          const date = new Date(`${cell.dayKey}T12:00:00Z`)
          assert.equal(date.getUTCDay(), colIdx === 6 ? 0 : colIdx + 1, `${cell.dayKey} sütun ${colIdx} hizası`)
          assert.equal(cell.day, date.getUTCDate(), `${cell.dayKey} gün sayısı`)
        }
      }
    }
  }
})

suite.test('monthMatrix: geçersiz anahtar boş dizi', () => {
  assert.deepEqual(monthMatrix('2026-13'), [])
  assert.deepEqual(monthMatrix('bogus'), [])
})

suite.test('abbrOfTeam: takip edilen takımlar kanonik kodla kısaltılır (normalize duyarsız)', () => {
  assert.equal(abbrOfTeam('Fenerbahçe'), 'FB')
  assert.equal(abbrOfTeam('fenerbahce sk'), 'FB')
  assert.equal(abbrOfTeam('GALATASARAY A2'), 'GS')
  assert.equal(abbrOfTeam('Galatasaray'), 'GS')
  assert.equal(abbrOfTeam('beşiktaş jk'), 'BJK')
  assert.equal(abbrOfTeam('Trabzonspor'), 'TS')
})

suite.test('abbrOfTeam: takip dışında TLA, yoksa adın ilk 3 harfi Türkçe büyük harf', () => {
  assert.equal(abbrOfTeam('Sporting CP'), 'SPO')
  assert.equal(abbrOfTeam('İstanbul Başakşehir'), 'İST')
  assert.equal(abbrOfTeam('ısparta 32 spor'), 'ISP')
  assert.equal(abbrOfTeam('AS Roma', 'ROM'), 'ROM')
  assert.equal(abbrOfTeam('Fenerbahçe', 'FEN'), 'FB', 'takip edilen takım TLA\'yı ezer')
  assert.equal(abbrOfTeam('', ''), '?')
})

suite.test('summarizeDay: canlı önce, sonra yaklaşan, sonra bitmiş, en son ertelenmiş', () => {
  const summary = summarizeDay('2026-10-22', [
    match('biten', {
      kickoff: '2026-10-22T13:00:00Z',
      status: 'FINISHED', statusGroup: 'finished', isFinished: true, isStarted: true,
      score: { home: 2, away: 1 },
    }),
    match('canli', {
      kickoff: '2026-10-22T17:00:00Z',
      status: 'IN_PLAY', statusGroup: 'live', isLive: true, isStarted: true, minute: 63,
    }),
    match('gecek', { kickoff: '2026-10-22T19:45:00Z' }),
    match('ertelenen', { kickoff: '2026-10-22T16:00:00Z', status: 'POSTPONED', statusGroup: 'inactive' }),
  ])
  assert.equal(summary.count, 4)
  assert.equal(summary.hasLive, true)
  assert.equal(summary.chips.length, 3)
  assert.equal(summary.overflow, 1, '4 maçın 4.\'ü chip\'e sığmaz')
  assert.deepEqual(summary.chips.map(chip => chip.id), ['canli', 'gecek', 'biten'])
  assert.deepEqual(summary.chips.map(chip => chip.tone), ['live', 'upcoming', 'finished'])
  assert.deepEqual(summary.chips.map(chip => chip.text), ["63'", '22:45', '2-1'])
  assert.equal(summary.chips[0].label, 'FB–ROM')
  assert.equal(summary.chips[0].title, 'Fenerbahçe – Roma')
  assert.equal(summary.chips[0].compCode, 'CL')
})

suite.test('summarizeDay: aynı gruptakiler gün içinde kronolojik sıralanır', () => {
  const summary = summarizeDay('2026-10-22', [
    match('gec-saat', { kickoff: '2026-10-22T19:45:00Z' }),
    match('erken-saat', { kickoff: '2026-10-22T14:00:00Z' }),
    match('biten-gec', {
      kickoff: '2026-10-22T19:00:00Z',
      status: 'FINISHED', statusGroup: 'finished', isFinished: true, isStarted: true,
      score: { home: 0, away: 0 },
    }),
    match('biten-erken', {
      kickoff: '2026-10-22T13:00:00Z',
      status: 'FINISHED', statusGroup: 'finished', isFinished: true, isStarted: true,
      score: { home: 1, away: 0 },
    }),
  ])
  assert.deepEqual(summary.chips.map(chip => chip.id), ['erken-saat', 'gec-saat', 'biten-erken'])
  assert.equal(summary.overflow, 1)
  assert.deepEqual(summary.chips.map(chip => chip.text), ['17:00', '22:45', '1-0'])
})

suite.test('summarizeDay: dakikasız canlı •, skorsuz bitmiş MS, ertelenmiş ERT', () => {
  const summary = summarizeDay('2026-10-22', [
    match('canli-akilli', { status: 'IN_PLAY', statusGroup: 'live', isLive: true, isStarted: true, minute: null }),
    match('skorsuz', { status: 'FINISHED', statusGroup: 'finished', isFinished: true, isStarted: true, score: null }),
    match('ertelendi', { status: 'POSTPONED', statusGroup: 'inactive' }),
  ])
  assert.equal(summary.count, 3)
  assert.deepEqual(summary.chips.map(chip => chip.text), ['•', 'MS', 'ERT'])
  assert.equal(summary.hasLive, true)
  assert.equal(summary.overflow, 0)
})

suite.test('summarizeDay: boş gün count=0; İstanbul dışına düşen kickoff elenir', () => {
  assert.deepEqual(summarizeDay('2026-10-05', []), { count: 0, hasLive: false, chips: [], overflow: 0 })
  assert.deepEqual(summarizeDay('2026-10-05', null), { count: 0, hasLive: false, chips: [], overflow: 0 })
  // 21:30Z kickoff İstanbul'da ertesi güne (23 Ekim 00:30) düşer.
  const late = summarizeDay('2026-10-23', [match('gece-maci', { kickoff: '2026-10-22T21:30:00Z' })])
  assert.equal(late.count, 1, 'gece maçı 23 Ekim kovasına girer')
  assert.equal(late.chips[0].text, '00:30')
  const wrongDay = summarizeDay('2026-10-22', [match('gece-maci', { kickoff: '2026-10-22T21:30:00Z' })])
  assert.equal(wrongDay.count, 0)
})

await runIfMain(suite)
export { suite }
