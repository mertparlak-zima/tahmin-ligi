import { Component } from '@geajs/core'
import leagueStore from '../stores/league-store'
import DateStrip from '../components/DateStrip'
import FilterBar from '../components/FilterBar'
import MatchRow from '../components/MatchRow'
import { cn } from '../utils/cn'

export default class MatchesPage extends Component {
  template() {
    if (leagueStore.loadingInitial) {
      return (
        <div class="page-skeleton">
          {[0, 1, 2].map(i => <div class="skeleton-card" key={i}></div>)}
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

    const groups = leagueStore.groupedMatches
    const anyMatches = (leagueStore.data?.matches ?? []).length === 0

    return (
      <div class="matches-page">
        <div class="page-meta">
          {leagueStore.data?.meta?.sync?.lastError ? (
            <span class="meta-warn">Canlı veri senkronizasyonunda hata var; veriler bayat olabilir.</span>
          ) : null}
        </div>

        <DateStrip />
        <FilterBar />

        {anyMatches ? (
          <div class="empty big">
            <div class="empty-title">Henüz maç yok</div>
            <div class="empty-sub">Fikstür ilk senkronizasyonda ESPN'den çekilir. Birkaç dakika içinde tekrar bak.</div>
            <button class="btn primary" click={() => leagueStore.refresh()}>Yenile</button>
          </div>
        ) : groups.length === 0 ? (
          <div class="empty">
            <div class="empty-title">Bu filtrede maç yok</div>
            <div class="empty-sub">Farklı bir tarih veya filtre dene.</div>
          </div>
        ) : (
          groups.map(group => (
            <section class="comp-group" key={group.code}>
              <header class="comp-group-head">
                <span class="comp-group-title">{group.name}</span>
                <span class="comp-group-count">
                  {group.matches.filter((m: any) => m.isLive).length > 0
                    ? `${group.matches.filter((m: any) => m.isLive).length} canlı · `
                    : ''}
                  {group.matches.length} maç
                </span>
              </header>
              <div class="match-list">
                {group.matches.map((match: any) => (
                  <MatchRow match={match} key={match.id} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    )
  }
}
