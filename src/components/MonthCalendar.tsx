// Ay takvimi (#19) — FIFA/EA FC tarzı ay grid'i: gün hücrelerinde fikstür
// kısaltmaları, bugün vurgusu, canlı nabız; hover'da gün önizleme popover'ı
// (#11 deseni); ‹ › ile sınırsız ay gezinme (sezon sınırı aşılırsa ?season=).

import { Component } from '@geajs/core'
import leagueStore from '../stores/league-store'
import CalWeekRow from './CalWeekRow'
import CalWeekday from './CalWeekday'
import { WEEKDAY_HEADERS, monthTitle } from '../utils/calendar.js'

export default class MonthCalendar extends Component {
  template() {
    return (
      <div class="cal-root">
        <div class="cal-head">
          <button class="cal-nav" aria-label="Önceki ay" click={() => leagueStore.selectMonth(-1)}>‹</button>
          <div class="cal-title-wrap">
            <span class="cal-title">{monthTitle(leagueStore.calendarMonthKey)}</span>
            {leagueStore.isCurrentMonth ? null : (
              <button class="cal-today-btn" click={() => leagueStore.goToTodayMonth()}>Bugün</button>
            )}
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
    )
  }
}
