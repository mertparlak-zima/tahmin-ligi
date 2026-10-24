import { Component } from '@geajs/core'
import leagueStore from '../stores/league-store'
import uiStore from '../stores/ui-store'
import SkeletonCard from '../components/SkeletonCard'
import ResultDay from '../components/ResultDay'

export default class ResultsPage extends Component {
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

    if (leagueStore.finishedMatches.length === 0) {
      return (
        <div class="empty big">
          <div class="empty-title">Biten maç yok</div>
          <div class="empty-sub">Sonuçlar maçlar tamamlandıkça burada birikir.</div>
        </div>
      )
    }

    return (
      <div class="results-page">
        <div class="page-meta">
          <span class="meta-main">{leagueStore.finishedMatches.length} biten maç</span>
          {identity ? <span class="meta-side">{identity.name} puanları gösteriliyor</span> : null}
        </div>
        {leagueStore.resultsByDay.map(g => (
          <ResultDay key={g.day} day={g.day} matches={g.matches} identityId={uiStore.identityId} />
        ))}
      </div>
    )
  }
}
