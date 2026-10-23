import ResultItem from './ResultItem'
import { relativeDayLabel } from '../utils/format'

export default function ResultDay({ day, matches, identityId }: {
  day: string
  matches: any[]
  identityId: string
}) {
  return (
    <section class="day-group">
      <header class="day-group-head">
        {relativeDayLabel(day)} · {matches.length} maç
      </header>
      {matches.map(match => (
        <ResultItem key={match.id} match={match} identityId={identityId} />
      ))}
    </section>
  )
}
