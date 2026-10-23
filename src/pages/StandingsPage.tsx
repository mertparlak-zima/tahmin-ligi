import leagueStore from '../stores/league-store'
import Podium from '../components/Podium'
import StandingsTable from '../components/StandingsTable'

export default function StandingsPage() {
  const meta = leagueStore.data?.meta
  const standings = leagueStore.standings
  const counts = meta?.counts
  const totalCorrect = standings.reduce((sum: number, r: any) => sum + r.correctOutcomes, 0)
  const average = standings.length > 0 ? Math.round(standings.reduce((s: number, r: any) => s + r.points, 0) / standings.length) : 0

  return (
    <div class="standings-page">
      <div class="page-meta">
        <span class="meta-main">{counts?.players ?? 0} oyuncu · {counts?.finished ?? 0} biten maç</span>
        {meta?.scoring ? (
          <span class="meta-side">{meta.scoring.label}{meta.scoring.status === 'provisional' ? ' (geçici)' : ''}</span>
        ) : null}
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

      <Podium />
      <StandingsTable />

      <div class="table-legend">
        O: oynanan maç · FB/GS/BJK/TS: takım bazlı doğru sonuç · P: puan
      </div>
    </div>
  )
}
