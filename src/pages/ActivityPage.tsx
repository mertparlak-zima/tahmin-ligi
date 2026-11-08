// İşlem Geçmişi (#40): tahmin hareketlerinin denetim listesi — kim, hangi
// maça, ne girdi/ne ile değiştirdi/kaldırdı; maskeli IP + şehir; ☰ ile satır
// detayı (tam User-Agent, tarayıcı/OS/cihaz, bölge, zaman damgası).
// Gea: class component'ler, erken return yok; liste doğrudan store getter'ından
// (ResultsPage deseni); satır durumu (açık/kapalı) satır component'inde.

import { Component } from '@geajs/core'
import eventsStore from '../stores/events-store'
import SkeletonCard from '../components/SkeletonCard'
import Avatar from '../components/Avatar'
import CompBadge from '../components/CompBadge'
import { fmtFullDate, fmtTime } from '../utils/format'
import { cn } from '../utils/cn'

/** H → "FB kazanır" biçiminde kısa etiket (maç yoksa ham harf). */
function outcomeLabel(outcome: string, match: any): string {
  if (!outcome) return ''
  if (!match) return outcome
  if (outcome === 'D') return 'Beraberlik'
  return `${outcome === 'H' ? match.homeShort : match.awayShort} kazanır`
}

class ActivityRow extends Component {
  open = false

  template({ event }: any) {
    const match = event.match
    const isUpdate = event.action === 'UPDATE'
    const isDelete = event.action === 'DELETE'
    const teams = match ? `${match.homeShort} – ${match.awayShort}` : 'Maç silinmiş'
    const actionText = event.action === 'CREATE'
      ? 'tahmin girdi'
      : isUpdate ? 'tahmini değiştirdi' : 'tahmini kaldırdı'
    return (
      <div class={cn('activity-row', this.open && 'open')}>
        <div class="activity-main">
          <span class="activity-time">{fmtFullDate(event.createdAt)} · {fmtTime(event.createdAt)}</span>
          <span class="activity-player">
            <Avatar color={event.player?.color ?? '#b8f34a'} initials={event.player?.initials ?? '?'} size="sm" photo={event.player?.avatarUrl ?? null} title={event.player?.name} />
            <b>{event.player?.name ?? 'Oyuncu'}</b>
          </span>
          <span class="activity-match">
            {match ? <CompBadge code={match.competition} size="sm" /> : null}
            <span>{teams}</span>
          </span>
          <span class={cn('activity-action', event.action.toLowerCase())}>
            {actionText}
            {event.action === 'CREATE' || isUpdate ? <b>{outcomeLabel(event.newOutcome, match)}</b> : null}
            {isUpdate ? <span class="activity-arrow">← {outcomeLabel(event.oldOutcome, match)}</span> : null}
            {isDelete ? <b>{outcomeLabel(event.oldOutcome, match)}</b> : null}
          </span>
          <span class="activity-meta">
            {event.ipMasked ? <span class="activity-ip">{event.ipMasked}</span> : null}
            {event.ipCity ? <span>{event.ipCity}{event.ipCountry ? ` · ${event.ipCountry}` : ''}</span> : null}
          </span>
          <button
            class="activity-expand"
            aria-expanded={this.open ? 'true' : 'false'}
            aria-label="Olay detayı"
            title="Detay"
            click={() => { this.open = !this.open }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
        {/* Detay paneli — .open CSS deseni (kural 4). */}
        <div class="activity-detail">
          <div class="activity-detail-grid">
            <div>
              <span class="activity-detail-label">Olay</span>
              <span>#{String(event.id).slice(0, 8)} · {event.action}</span>
            </div>
            <div>
              <span class="activity-detail-label">Zaman</span>
              <span>{fmtFullDate(event.createdAt)} {fmtTime(event.createdAt)}</span>
            </div>
            <div>
              <span class="activity-detail-label">Tarayıcı</span>
              <span>{event.ua ? `${event.ua.browser} · ${event.ua.os} · ${event.ua.device}` : 'Bilinmiyor'}</span>
            </div>
            <div>
              <span class="activity-detail-label">Konum</span>
              <span>{[event.ipCity, event.ipRegion, event.ipCountry].filter(Boolean).join(' · ') || 'Bilinmiyor'}</span>
            </div>
          </div>
          <div class="activity-ua-block">
            <span class="activity-detail-label">User-Agent</span>
            <code class="activity-ua">{event.userAgent || '—'}</code>
          </div>
        </div>
      </div>
    )
  }
}

export default class ActivityPage extends Component {
  created() {
    // Tembel yükleme: sayfa açılınca ensure (TTL'li — store).
    eventsStore.ensure()
  }

  template() {
    if (eventsStore.loading && !eventsStore.loaded) {
      return (
        <div class="page-skeleton">
          {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      )
    }

    if (eventsStore.error && !eventsStore.loaded) {
      return (
        <div class="error-state">
          <div class="error-title">İşlem geçmişi yüklenemedi</div>
          <div class="error-sub">{eventsStore.error}</div>
          <button class="btn primary" click={() => eventsStore.refresh()}>Tekrar dene</button>
        </div>
      )
    }

    return (
      <div class="activity-page">
        <div class="page-meta">
          <span class="meta-main">İşlem Geçmişi · son tahmin hareketleri</span>
        </div>

        {eventsStore.events.length === 0 ? (
          <div class="empty big">
            <div class="empty-title">Henüz hareket yok</div>
            <div class="empty-sub">Tahminler girildikçe, değiştikçe veya kaldırıldıkça burada listelenir.</div>
          </div>
        ) : (
          <div class="activity-list">
            {eventsStore.events.map((event: any) => (
              <ActivityRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    )
  }
}
