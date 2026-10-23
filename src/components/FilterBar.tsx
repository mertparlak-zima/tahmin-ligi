import leagueStore from '../stores/league-store'
import { cn } from '../utils/cn'
import type { StatusFilter } from '../stores/league-store'

const STATUS_TABS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'Tümü' },
  { key: 'live', label: 'Canlı' },
  { key: 'upcoming', label: 'Yaklaşan' },
  { key: 'finished', label: 'Bitti' },
]

export default function FilterBar() {
  const comps = leagueStore.data?.competitions ?? []
  return (
    <div class="filter-bar">
      <div class="segmented" role="tablist" aria-label="Maç durumu">
        {STATUS_TABS.map(tab => (
          <button
            class={cn('seg-item', leagueStore.statusFilter === tab.key && 'active')}
            key={tab.key}
            click={() => (leagueStore.statusFilter = tab.key)}
          >
            {tab.label}
            {tab.key === 'live' && leagueStore.hasLive ? <span class="seg-live-dot"></span> : null}
          </button>
        ))}
      </div>
      <select
        class="comp-select"
        aria-label="Turnuva"
        change={e => (leagueStore.competitionFilter = (e.target as HTMLSelectElement).value)}
      >
        <option value="all" selected={leagueStore.competitionFilter === 'all'}>Tüm kupalar</option>
        {comps.map((c: any) => (
          <option value={c.code} selected={leagueStore.competitionFilter === c.code}>{c.name}</option>
        ))}
      </select>
    </div>
  )
}
