import EditorRow from './EditorRow'
import { relativeDayLabel } from '../../utils/format'

export default function EditorDay({ day, matches, locked = false }: {
  day: string
  matches: any[]
  locked?: boolean
}) {
  return (
    <section class={locked ? 'admin-day admin-day-locked' : 'admin-day'}>
      <header class="admin-day-head">
        {locked ? <span class="lock-icon">🔒</span> : null}
        {relativeDayLabel(day)} · {matches.length} maç{locked ? ' — kilitli' : ''}
      </header>
      {matches.map(match => <EditorRow key={match.id} match={match} />)}
    </section>
  )
}
