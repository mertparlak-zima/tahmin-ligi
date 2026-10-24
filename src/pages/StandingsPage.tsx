import { Component } from '@geajs/core'
import leagueStore from '../stores/league-store'
import SkeletonCard from '../components/SkeletonCard'
import SeasonOption from '../components/SeasonOption'
import Podium from '../components/Podium'
import StandingsTable from '../components/StandingsTable'

export default class StandingsPage extends Component {
  template() {
    // "Geçmiş Sezonlar" (#18 PR2): seçili arşiv sezonu ayrı veriyle render edilir;
    // ana lig verisi (diğer sayfalar) aktif sezon olarak kalır.
    const view = leagueStore.standingsData

    if (leagueStore.loadingInitial || leagueStore.archiveLoading || (leagueStore.selectedSeason !== 0 && !view)) {
      return (
        <div class="page-skeleton">
          <div class="stat-cards">
            {[0, 1, 2, 3].map(i => <SkeletonCard key={i} shape="stat" />)}
          </div>
          <SkeletonCard shape="table" />
        </div>
      )
    }

    if (leagueStore.archiveError) {
      return (
        <div class="error-state">
          <div class="error-title">Sezon verisi yüklenemedi</div>
          <div class="error-sub">{leagueStore.archiveError}</div>
          <button class="btn primary" click={() => leagueStore.selectSeason(leagueStore.selectedSeason)}>Tekrar dene</button>
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

    const meta = view?.meta
    const standings: any[] = view?.standings ?? []
    const counts = meta?.counts
    const totalCorrect = standings.reduce((sum: number, r: any) => sum + r.correctOutcomes, 0)
    const average = standings.length > 0
      ? Math.round(standings.reduce((s: number, r: any) => s + r.points, 0) / standings.length)
      : 0

    return (
      <div class="standings-page">
        <div class="page-meta">
          <span class="meta-main">{counts?.players ?? 0} oyuncu · {counts?.finished ?? 0} biten maç</span>
          {meta?.scoring ? (
            <span class="meta-side">{meta.scoring.label}{meta.scoring.status === 'provisional' ? ' (geçici)' : ''}</span>
          ) : null}
          <span class="season-picker">
            <span class="season-picker-label">Geçmiş Sezonlar</span>
            <select
              class="comp-select"
              aria-label="Sezon"
              value={String(leagueStore.selectedSeason)}
              change={e => leagueStore.selectSeason(Number((e.target as HTMLSelectElement).value))}
            >
              <option value="0">{leagueStore.activeSeasonLabel} (şu an)</option>
              {leagueStore.pastSeasons.map(s => (
                <SeasonOption key={s.year} value={s.year} label={s.label} />
              ))}
            </select>
          </span>
        </div>

        <div class="stat-cards">
          <div class="stat-card">
            <span class="stat-label">Lider</span>
            <span class="stat-value">{meta?.leader?.name ?? '—'}</span>
            <span class="stat-sub">{meta?.leader ? `${meta.leader.points} puan` : 'Henüz maç bitmedi'}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Katılımcı</span>
            <span class="stat-value">{counts?.players ?? 0}</span>
            <span class="stat-sub">oyuncu</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Doğru sonuç</span>
            <span class="stat-value">{totalCorrect}</span>
            <span class="stat-sub">toplam isabet</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Ortalama</span>
            <span class="stat-value">{average}</span>
            <span class="stat-sub">puan / oyuncu</span>
          </div>
        </div>

        <Podium standings={standings} />
        <StandingsTable standings={standings} />

        <div class="table-legend">
          O: oynanan maç · FB/GS/BJK/TS: takım bazlı doğru sonuç · P: puan
        </div>
      </div>
    )
  }
}
