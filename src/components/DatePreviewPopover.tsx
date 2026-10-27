// Tarih chip hover önizlemesi: sabit konumlu popover (.open deseni — MatchSheet gibi).
// Konum, chip'in mouseoverhandler'ında imperatif atanır (bkv. Crest deseni):
// store-durumlu re-render'da onAfterRender tekrar çalışmadığı için burada
// yalnız görünürlük sınıfı ve içerik reaktif tutulur.

import { Component } from '@geajs/core'
import leagueStore from '../stores/league-store'
import uiStore from '../stores/ui-store'
import DatePreview from './DatePreview'

export default class DatePreviewPopover extends Component {
  private onScroll = () => uiStore.closeDatePreview()

  created() {
    // Şerit kaydırma/sayfa kaydırma sırasında popover chip'ten kopmasın.
    window.addEventListener('scroll', this.onScroll, { capture: true, passive: true })
  }

  template() {
    const open = uiStore.datePreviewKey !== ''
    const below = (uiStore.datePreviewRect?.top ?? 999) < 220
    return (
      <div
        id="date-preview-popover"
        class={`date-preview-popover${open ? ' open' : ''}${below ? ' below' : ''}`}
        aria-hidden="true"
      >
        {(leagueStore.calendarMatchesByDay[uiStore.datePreviewKey] ?? []).map(match => (
          <DatePreview key={match.id} match={match} />
        ))}
      </div>
    )
  }
}
