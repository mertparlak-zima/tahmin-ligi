import EditorRow from './EditorRow'
import { relativeDayLabel } from '../../utils/format'

export default function EditorDay({ day, matches }: { day: string; matches: any[] }) {
  return (
    <section class="admin-day">
      <header class="admin-day-head">
        {relativeDayLabel(day)} · {matches.length} maç
      </header>
      {matches.map(match => <EditorRow key={match.id} match={match} />)}
    </section>
  )
}
