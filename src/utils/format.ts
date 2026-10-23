// Tarih/saat biçimleme — her zaman Europe/Istanbul saat diliminde.

export const TZ = 'Europe/Istanbul'

const timeFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const weekdayFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, weekday: 'short' })
const dayFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric' })
const monthFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, month: 'short' })
const fullFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: TZ,
  day: 'numeric',
  month: 'long',
  weekday: 'long',
})

/** YYYY-AA-GG (İstanbul). */
export function dateKey(iso: string): string {
  return keyFmt.format(new Date(iso))
}

export function todayKey(): string {
  return keyFmt.format(new Date())
}

export function fmtTime(iso: string): string {
  return timeFmt.format(new Date(iso))
}

export function fmtWeekday(key: string): string {
  // key YYYY-AA-GG; ayın sonuna 12:00 ile güvenli parse
  return weekdayFmt.format(new Date(`${key}T12:00:00Z`)).toLocaleUpperCase('tr-TR')
}

export function fmtDay(key: string): string {
  return dayFmt.format(new Date(`${key}T12:00:00Z`))
}

export function fmtMonth(key: string): string {
  return monthFmt.format(new Date(`${key}T12:00:00Z`)).toLocaleLowerCase('tr-TR')
}

/** "24 Ekim Cumartesi" */
export function fmtFullDate(iso: string): string {
  return fullFmt.format(new Date(iso))
}

/** Date key için göreli gün etiketi: Bugün / Dün / tam tarih. */
export function relativeDayLabel(key: string): string {
  const today = todayKey()
  if (key === today) return 'Bugün'
  if (key === shiftDay(today, -1)) return 'Dün'
  return fmtFullDate(`${key}T12:00:00Z`)
}

export function shiftDay(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return keyFmt.format(d)
}

export function initialsOf(name: string): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toLocaleUpperCase('tr-TR') || '?'
}

/** Tahmin metni: "Fenerbahçe yener" / "Beraberlik". */
export function outcomeLabel(outcome: string, homeShort: string, awayShort: string): string {
  if (outcome === 'D') return 'Beraberlik'
  return `${outcome === 'H' ? homeShort : awayShort} yener`
}

export function isSameDayKey(a: string, b: string): boolean {
  return a === b
}
