import leagueStore from '../stores/league-store'
import SegButton from './SegButton'
import CompOption from './CompOption'
import type { StatusFilter } from '../stores/league-store'

const STATUS_TABS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'Tümü' },
  { key: 'live', label: 'Canlı' },
  { key: 'upcoming', label: 'Yaklaşan' },
  { key: 'finished', label: 'Bitti' },
]

export default function FilterBar() {
  return (
    <div class="filter-bar">
      <div class="segmented" role="tablist" aria-label="Maç durumu">
        {STATUS_TABS.map(tab => (
          <SegButton
            key={tab.key}
            active={leagueStore.statusFilter === tab.key}
            label={tab.label}
            hasLive={tab.key === 'live' && leagueStore.hasLive}
            onSelect={() => (leagueStore.statusFilter = tab.key)}
          />
        ))}
      </div>
      <select
        class="comp-select"
        aria-label="Turnuva"
        value={leagueStore.competitionFilter}
        change={e => (leagueStore.competitionFilter = (e.target as HTMLSelectElement).value)}
      >
        <option value="all">Tüm kupalar</option>
        {leagueStore.competitions.map((c: any) => (
          <CompOption key={c.code} value={c.code} label={c.name} />
        ))}
      </select>
    </div>
  )
}
