import { Component } from '@geajs/core'
import leagueStore from '../stores/league-store'
import uiStore from '../stores/ui-store'
import ResultDay from '../components/ResultDay'

export default class ResultsPage extends Component {
  template() {
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
          <ResultDay key={g.day} day={g.day} matches={g.matches} identityId={identity?.id ?? ''} />
        ))}
      </div>
    )
  }
}
