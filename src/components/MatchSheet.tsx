import { Component } from '@geajs/core'
import Crest from './Crest'
import CompBadge from './CompBadge'
import FormChips from './FormChips'
import PredRow from './PredRow'
import Avatar from './Avatar'
import leagueStore from '../stores/league-store'
import uiStore from '../stores/ui-store'
import { fmtFullDate, fmtTime } from '../utils/format'
import { cn } from '../utils/cn'

export default class MatchSheet extends Component {
  // Kök eleman her zaman render edilir; içerik yalnız maç seçiliyken.
  // (Erken `return null` deseni reaktif yeniden render'ı kırıyor — o yoldan kaçınılır.)
  template() {
    const match = uiStore.sheetMatchId ? leagueStore.getMatch(uiStore.sheetMatchId) : null
    const comp = match
      ? (leagueStore.data?.competitions ?? []).find((c: any) => c.code === match.competitionCode)
      : null

    const pill = !match
      ? { cls: 'upcoming', text: '' }
      : match.statusGroup === 'inactive'
        ? { cls: 'inactive', text: match.status === 'CANCELLED' ? 'İPTAL' : 'ERTELENDİ' }
        : match.isLive
          ? leagueStore.staleActive
            ? { cls: 'live', text: `SON BİLGİ${match.minute ? ` · ${match.minute}'` : ''}` }
            : { cls: 'live', text: `CANLI${match.minute ? ` · ${match.minute}'` : ''}` }
          : match.isFinished
            ? { cls: 'finished', text: 'BİTTİ' }
            : { cls: 'upcoming', text: fmtTime(match.kickoff) }

    return (
      <div class={cn('sheet-root', match && 'open')}>
        {match ? (
          <div>
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
                      <PredRow key={p.playerId} pred={p} isLive={match.isLive} />
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
                          <Avatar key={p.playerId} color={p.color} initials={p.initials} size="sm" title={p.name} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }
}
