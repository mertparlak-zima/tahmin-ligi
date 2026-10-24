import CompBadge from './CompBadge'
import { fmtTime } from '../utils/format'

export default function DatePreview({ match }: { match: any }) {
  return (
    <div class="date-preview-row">
      <span class="date-preview-time">{fmtTime(match.kickoff)}</span>
      <span class="date-preview-teams">{match.home.short} – {match.away.short}</span>
      <CompBadge code={match.competitionCode} size="sm" />
    </div>
  )
}
