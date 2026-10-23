import { Component } from '@geajs/core'
import adminStore from '../../stores/admin-store'
import { fmtTime } from '../../utils/format'
import { cn } from '../../utils/cn'

function editorStatusText(match: any): string {
  if (match.statusGroup === 'inactive') return match.status === 'CANCELLED' ? 'İptal' : 'Ertelendi'
  if (match.locked && match.score) return `MS ${match.score.home}-${match.score.away}`
  if (match.locked) return 'Kilitli'
  return 'Yaklaşan'
}

export default function EditorRow({ match }: { match: any }) {
  const draft = adminStore.drafts[match.id] ?? ''
  const baseline = adminStore.baseline[match.id] ?? ''
  const dirty = draft !== baseline
  return (
    <div class={cn('editor-row', match.locked && 'locked', dirty && 'dirty')}>
      <span class="editor-time">{fmtTime(match.kickoff)}</span>
      <span class="editor-comp">{match.competitionCode}</span>
      <span class="editor-teams">{match.homeShort} – {match.awayShort}</span>
      <span class="editor-status">{editorStatusText(match)}</span>
      <select
        class="editor-select"
        disabled={match.locked}
        value={draft}
        change={e => adminStore.setDraft(match.id, (e.target as HTMLSelectElement).value)}
      >
        <option value="">—</option>
        <option value="H">{match.homeShort} yener</option>
        <option value="D">Beraberlik</option>
        <option value="A">{match.awayShort} yener</option>
      </select>
    </div>
  )
}
