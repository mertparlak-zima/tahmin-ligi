import Crest from './Crest'
import CompBadge from './CompBadge'
import FormChips from './FormChips'
import leagueStore from '../stores/league-store'
import uiStore from '../stores/ui-store'
import { fmtFullDate, fmtTime } from '../utils/format'
import { cn } from '../utils/cn'

export default function MatchSheet() {
  const match = uiStore.sheetMatchId ? leagueStore.getMatch(uiStore.sheetMatchId) : null
  if (!match) return null

  const comp = (leagueStore.data?.competitions ?? []).find((c: any) => c.code === match.competitionCode)

  const pill =
    match.statusGroup === 'inactive'
      ? { cls: 'inactive', text: match.status === 'CANCELLED' ? 'İPTAL' : 'ERTELENDİ' }
      : match.isLive
        ? { cls: 'live', text: `CANLI${match.minute ? ` · ${match.minute}'` : ''}` }
        : match.isFinished
          ? { cls: 'finished', text: 'BİTTİ' }
          : { cls: 'upcoming', text: fmtTime(match.kickoff) }

  return (
    <div class="sheet-root open">
      <div class="sheet-backdrop" click={() => uiStore.closeSheet()}></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Maç detayı">
        <div class="sheet-grabber"></div>
        <div class="sheet-head">
          <CompBadge code={match.competitionCode} />
          <div class="sheet-head-text">
            <span class="sheet-comp">{comp?.name ?? match.competitionCode}</span>
            <span class="sheet-date">{fmtFullDate(match.kickoff)} · {fmtTime(match.kickoff)}</span>
          </div>
        </div>

        <div class="sheet-scoreboard">
          <div class="sheet-team">
            <Crest name={match.home.name} short={match.home.short} crest={match.home.crest} size={46} />
            <span class="sheet-team-name">{match.home.short}</span>
            <FormChips form={match.home.form} />
          </div>
          <div class="sheet-score">
            <span class={cn('score-value', match.isLive && 'live')}>
              {match.score ? `${match.score.home} – ${match.score.away}` : '–'}
            </span>
            <span class={cn('status-pill', pill.cls)}>{pill.text}</span>
          </div>
          <div class="sheet-team">
            <Crest name={match.away.name} short={match.away.short} crest={match.away.crest} size={46} />
            <span class="sheet-team-name">{match.away.short}</span>
            <FormChips form={match.away.form} />
          </div>
        </div>

        <div class="sheet-section">
          <div class="sheet-section-title">
            Tahminler
            <span class="sheet-section-meta">{match.predictionCount} oyuncu tahmin verdi</span>
          </div>

          {match.predictions.length === 0 ? (
            <div class="sheet-empty">Bu maça tahmin girilmemiş.</div>
          ) : match.predictionsVisible ? (
            <div class="pred-list">
              {match.predictions.map((p: any) => (
                <div class="pred-row" key={p.playerId}>
                  <span class="avatar" style={{ '--avatar-color': p.color } as any}>
                    {p.initials}
                  </span>
                  <span class="pred-name">{p.name}</span>
                  <span class="pred-label">{p.label}</span>
                  {p.points === null || p.points === undefined ? (
                    <span class="pred-points pending">
                      {match.isLive ? 'CANLI' : 'Bekliyor'}
                    </span>
                  ) : (
                    <span class={cn('pred-points', p.correct ? 'hit' : 'miss')}>+{p.points} P</span>
                  )}
                </div>
              ))}
              {match.isFinished ? (
                <div class="pred-legend">
                  <span><i class="dot hit"></i>Doğru sonuç</span>
                  <span><i class="dot miss"></i>Isabet yok</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div class="pred-sealed">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <div>
                <div class="pred-sealed-title">Tahminler maç başlayınca açılır</div>
                <div class="pred-sealed-sub">Şu ana kadar {match.predictionCount} tahmin girildi.</div>
                <div class="pred-sealed-avatars">
                  {match.predictions.map((p: any) => (
                    <span class="avatar sm" style={{ '--avatar-color': p.color } as any} key={p.playerId} title={p.name}>
                      {p.initials}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
