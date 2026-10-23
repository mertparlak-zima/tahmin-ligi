import { Component } from '@geajs/core'
import leagueStore from '../stores/league-store'
import uiStore from '../stores/ui-store'
import Avatar from '../components/Avatar'
import PredictionCard from '../components/PredictionCard'

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

    const myRow = leagueStore.standings.find((r: any) => r.id === identity.id)
    const wrongCount = myRow ? myRow.played - myRow.correctOutcomes : 0
    const myMatches = uiStore.myMatches
    const sealed = uiStore.sealedCount

    return (
      <div class="mypage">
        <div class="identity-hero">
          <Avatar color={identity.color} initials={identity.initials} size="xl" />
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

        {myMatches.length === 0 ? (
          <div class="empty">
            <div class="empty-title">Açılan tahmin yok</div>
            <div class="empty-sub">Maçlar başlayınca tahminlerin burada listelenir.</div>
          </div>
        ) : (
          <div class="pred-cards">
            {uiStore.myMatches.map(match => (
              <PredictionCard key={match.id} match={match} identityId={uiStore.identityId} />
            ))}
          </div>
        )}
      </div>
    )
  }
}
