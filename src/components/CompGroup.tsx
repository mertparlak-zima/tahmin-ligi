import MatchItem from './MatchItem'

export default function CompGroup({ code, name, matches }: { code: string; name: string; matches: any[] }) {
  const liveCount = matches.filter(m => m.isLive).length
  return (
    <section class="comp-group">
      <header class="comp-group-head">
        <span class="comp-group-title">{name}</span>
        <span class="comp-group-count">
          {liveCount > 0 ? `${liveCount} canlı · ` : ''}{matches.length} maç
        </span>
      </header>
      <div class="match-list">
        {matches.map(match => <MatchItem key={match.id} match={match} />)}
      </div>
    </section>
  )
}
