import leagueStore from '../stores/league-store'
import DateChip from './DateChip'

export default function DateStrip() {
  return (
    <div class="date-strip" role="tablist" aria-label="Maç günleri">
      {leagueStore.dateList.map(chip => (
        <DateChip
          key={chip.key}
          chip={chip}
          selected={leagueStore.selectedDate === chip.key}
          onSelect={() => (leagueStore.selectedDate = chip.key)}
        />
      ))}
    </div>
  )
}
