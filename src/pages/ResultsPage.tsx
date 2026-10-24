// Akış (#20 U9): son tahmin girişleri/güncellemeleri (MÜHÜRLÜ — outcome asla
// gösterilmez) + bitmiş maç sonuçları. Geçmiş sekmesinin yerine geçti; sonuç
// gezintisi ay takviminin geçmiş aylarından karşılanır.
// Gea: class component'ler, erken return yok; liste doğrudan store getter'ından.

import { Component } from '@geajs/core'
import leagueStore from '../stores/league-store'
import uiStore from '../stores/ui-store'
import SkeletonCard from '../components/SkeletonCard'
import Avatar from '../components/Avatar'
import CompBadge from '../components/CompBadge'
import { fmtFullDate, fmtTime } from '../utils/format'
import { cn } from '../utils/cn'

class FlowEventRow extends Component {
  template({ event }: any) {
    const isPred = event.type === 'prediction'
    return (
      <div class={cn('flow-event', isPred ? 'pred' : 'result')}>
        {isPred ? (
          <Avatar color={event.playerColor} initials={event.playerInitials} size="sm" photo={event.playerAvatarUrl} />
        ) : (
          <span class="flow-result-badge" aria-hidden="true">FT</span>
        )}
        <span class="flow-body">
          <span class="flow-text">
            {isPred ? (
              <span>
                <b>{event.playerName}</b>, {event.teams} maçı için{' '}
                {event.kind === 'updated' ? 'tahminini güncelledi' : 'tahmin girdi'}
              </span>
            ) : (
              <span>
                <b>{event.teams}</b> <span class="flow-score">{event.score}</span> bitti ·{' '}
                {event.correctCount} doğru
              </span>
            )}
          </span>
          <span class="flow-meta">
            <CompBadge code={event.compCode} size="sm" />
            {event.kickoff ? (
              <span class="flow-time">{fmtFullDate(event.kickoff)} · {fmtTime(event.kickoff)}</span>
            ) : null}
            {isPred && event.matchStatus === 'inactive' && event.kickoffPast ? (
              <span class="player-tag sealed">ertelendi</span>
            ) : null}
          </span>
        </span>
      </div>
    )
  }
}

export default class FlowPage extends Component {
  template() {
    if (leagueStore.loadingInitial) {
      return (
        <div class="page-skeleton">
          {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      )
    }

    if (leagueStore.error && !leagueStore.data) {
      return (
        <div class="error-state">
          <div class="error-title">Veriler yüklenemedi</div>
          <div class="error-sub">{leagueStore.error}</div>
          <button class="btn primary" click={() => leagueStore.refresh()}>Tekrar dene</button>
        </div>
      )
    }

    const identity = uiStore.identity
    const events = leagueStore.flowEvents

    return (
      <div class="flow-page">
        <div class="page-meta">
          <span class="meta-main">Akış · son tahminler ve sonuçlar</span>
          {identity ? <span class="meta-side">{identity.name} puanları Puan Durumu'nda</span> : null}
        </div>

        {events.length === 0 ? (
          <div class="empty big">
            <div class="empty-title">Henüz olay yok</div>
            <div class="empty-sub">Tahminler girildikçe ve maçlar bitdikçe akış burada birikir.</div>
          </div>
        ) : (
          <div class="flow-list">
            {leagueStore.flowEvents.map(event => (
              <FlowEventRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    )
  }
}
