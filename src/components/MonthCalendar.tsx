// Ay takvimi (#19) — #24 sonrası kullanıcı raporu: ilk açılışta takvim tüm
// ekranı kaplıyor, maçlar fold dışında kalıyordu. Takvim artık varsayılan
// KOMPAKTTIR (tek satır: günü kaydır + seçili gün etiketi + maç sayısı +
// genişlet); ay ızgarası istenince açılır. Gün tıklamasındaki maç listesine
// kaydırma akışı (bkv. CalDayCell) korunur. İlk açılışta OTOMATİK KAYDIRMA
// YOKTUR — kompakt bar + filtre + maçlar ilk ekrana sığar.

import { Component } from '@geajs/core'
import leagueStore from '../stores/league-store'
import CalWeekRow from './CalWeekRow'
import CalWeekday from './CalWeekday'
import { WEEKDAY_HEADERS, monthTitle } from '../utils/calendar.js'
import { todayKey } from '../utils/format'

const dayLabel = key => {
  const d = new Date(`${key}T12:00:00`)
  return new Intl.DateTimeFormat('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' }).format(d)
}

const shiftDayKey = (key, delta) => {
  const d = new Date(`${key}T12:00:00`)
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

export default class MonthCalendar extends Component {
  /** Ay ızgarası açık mı (varsayılan kapalı — kompakt bar). */
  expanded = false

  toggleExpanded() {
    this.expanded = !this.expanded
  }

  template() {
    const stats = leagueStore.calendarMonthStats
    const selectedKey = leagueStore.selectedDate || todayKey()
    const selectedCount = (leagueStore.matchesByDay[selectedKey] ?? []).length
    const summary = [
      `${stats.total} maç`,
      stats.live > 0 ? `${stats.live} canlı` : '',
      stats.finished > 0 ? `${stats.finished} bitti` : '',
    ].filter(Boolean).join(' · ')

    return (
      <div class="cal-root">
        {this.expanded ? (
          <div>
            <div class="cal-head">
              <button class="cal-nav" aria-label="Önceki ay" click={() => leagueStore.selectMonth(-1)}>‹</button>
              <div class="cal-title-wrap">
                <span class="cal-title">{monthTitle(leagueStore.calendarMonthKey)}</span>
                {summary ? <span class="cal-sub">{summary}</span> : null}
              </div>
              <div class="cal-head-right">
                {leagueStore.isCurrentMonth ? null : (
                  <button class="cal-today-btn" click={() => leagueStore.goToTodayMonth()}>Bugün</button>
                )}
                <button class="cal-nav" aria-label="Takvimi kapat" click={() => this.toggleExpanded()}>⌃</button>
              </div>
              <button class="cal-nav" aria-label="Sonraki ay" click={() => leagueStore.selectMonth(1)}>›</button>
            </div>
            <div class="cal-grid-head">
              {WEEKDAY_HEADERS.map(h => <CalWeekday key={h} label={h} />)}
            </div>
            {leagueStore.calendarLoading ? (
              <div class="cal-loading">
                <span class="cal-loading-text">Sezon verisi yükleniyor…</span>
              </div>
            ) : (
              <div class="cal-grid">
                {leagueStore.calendarWeeks.map(week => (
                  <CalWeekRow key={week[0].cellId} days={week} />
                ))}
              </div>
            )}
            {leagueStore.calendarError ? (
              <div class="cal-error">{leagueStore.calendarError}</div>
            ) : null}
          </div>
        ) : (
          <div class="cal-compact">
            <button class="cal-nav" aria-label="Önceki gün" click={() => leagueStore.selectDay(shiftDayKey(selectedKey, -1))}>‹</button>
            <button class="cal-compact-label" click={() => this.toggleExpanded()} aria-label="Takvimi aç">
              <span class="cal-compact-date">
                {selectedKey === todayKey() ? 'Bugün' : dayLabel(selectedKey)}
              </span>
              <span class="cal-compact-count">
                {selectedCount > 0 ? `${selectedCount} maç` : 'maç yok'}
              </span>
              <span class="cal-compact-chevron" aria-hidden="true">⌄</span>
            </button>
            <button class="cal-nav" aria-label="Sonraki gün" click={() => leagueStore.selectDay(shiftDayKey(selectedKey, 1))}>›</button>
          </div>
        )}
      </div>
    )
  }
}
