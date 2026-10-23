import { Component } from '@geajs/core'
import leagueStore from '../stores/league-store'
import uiStore from '../stores/ui-store'
import Crest from '../components/Crest'
import CompBadge from '../components/CompBadge'
import { fmtFullDate, fmtTime, outcomeLabel } from '../utils/format'
import { cn } from '../utils/cn'

export default class MyPredictionsPage extends Component {
  created() {
    if (!uiStore.identityId && (leagueStore.data?.players ?? []).length > 0) {
      uiStore.openIdentityModal()
    }
  }

  template() {
    const identity = uiStore.identity
    const players: any[] = leagueStore.data?.players ?? []

    if (players.length === 0) {
      return (
        <div class="empty big">
          <div class="empty-title">Henüz oyuncu yok</div>
          <div class="empty-sub">Oyuncular yönetim panelinden eklenir.</div>
        </div>
      )
    }

    if (!identity) {
      return (
        <div class="empty big">
          <div class="empty-title">Kimsin?</div>
          <div class="empty-sub">Tahmin karneni görmek için adını seç.</div>
          <button class="btn primary" click={() => uiStore.openIdentityModal()}>Oyuncu seç</button>
        </div>
      )
    }

    const matches: any[] = leagueStore.data?.matches ?? []
    const mine = matches.filter(m => m.predictions.some((p: any) => p.playerId === identity.id))
    const revealed = mine.filter(m => m.predictionsVisible)
    const sealed = mine.filter(m => !m.predictionsVisible)

    const finished = revealed
      .filter(m => m.isFinished)
      .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff))
    const started = revealed
      .filter(m => !m.isFinished)
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))

    const myRow = leagueStore.standings.find((r: any) => r.id === identity.id)
    const wrongCount = myRow ? myRow.played - myRow.correctOutcomes : 0

    return (
      <div class="mypage">
        <div class="identity-hero">
          <span class="avatar xl" style={{ '--avatar-color': identity.color } as any}>{identity.initials}</span>
          <div class="identity-hero-text">
            <span class="identity-name">{identity.name}</span>
            <span class="identity-sub">
              {myRow ? `${myRow.rank}. sıradasın · ${myRow.played} maçta tahmin` : 'Henüz sıralaman yok'}
            </span>
          </div>
          <button class="btn ghost sm" click={() => uiStore.openIdentityModal()}>Değiştir</button>
        </div>

        <div class="stat-cards">
          <div class="stat-card">
            <span class="stat-label">Puan</span>
            <span class="stat-value">{myRow?.points ?? 0}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Doğru sonuç</span>
            <span class="stat-value">{myRow?.correctOutcomes ?? 0}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Yanlış sonuç</span>
            <span class="stat-value">{wrongCount}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">İsabet</span>
            <span class="stat-value">{myRow?.accuracy ?? 0}%</span>
          </div>
        </div>

        {sealed.length > 0 ? (
          <div class="sealed-note">
            🔒 {sealed.length} tahminin mühürlü — maçlar başlayınca açılacak.
          </div>
        ) : null}

        {finished.length === 0 && started.length === 0 ? (
          <div class="empty">
            <div class="empty-title">Açılan tahmin yok</div>
            <div class="empty-sub">Maçlar başlayınca tahminlerin burada listelenir.</div>
          </div>
        ) : (
          <div class="pred-cards">
            {[...finished, ...started].map(match => {
              const pred = match.predictions.find((p: any) => p.playerId === identity.id)
              return (
                <button class="pred-card" key={match.id} click={() => uiStore.openSheet(match.id)}>
                  <div class="pred-card-head">
                    <CompBadge code={match.competitionCode} size="sm" />
                    <span class="pred-card-date">{fmtFullDate(match.kickoff)}</span>
                  </div>
                  <div class="pred-card-teams">
                    <div class="pred-card-side">
                      <Crest name={match.home.name} short={match.home.short} crest={match.home.crest} size={30} />
                      <span>{match.home.short}</span>
                      <span class="pred-card-score">{match.score ? match.score.home : '–'}</span>
                    </div>
                    <div class="pred-card-side">
                      <Crest name={match.away.name} short={match.away.short} crest={match.away.crest} size={30} />
                      <span>{match.away.short}</span>
                      <span class="pred-card-score">{match.score ? match.score.away : '–'}</span>
                    </div>
                  </div>
                  <div class="pred-card-foot">
                    <span class="pred-card-label">
                      Tahminin: <b>{pred?.label ?? outcomeLabel(pred.outcome, match.home.short, match.away.short)}</b>
                    </span>
                    {match.isFinished ? (
                      <span class={cn('pred-points', pred?.correct ? 'hit' : 'miss')}>
                        {pred?.points ?? 0} P
                      </span>
                    ) : (
                      <span class="pred-points pending">{match.isLive ? 'CANLI' : 'Bekliyor'}</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }
}
