// MatchItem (#12 B): MatchRow + koşullu akordiyon içeriği.
// Accordion modunda satır tıklanınca altında tahminler açılır (admin
// EditorRow deseni — tek kök div + içerde ternary; kural 12'ye uyum).

import { Component } from '@geajs/core'
import uiStore from '../stores/ui-store'
import MatchRow from './MatchRow'
import PredRow from './PredRow'
import Avatar from './Avatar'

export default class MatchItem extends Component {
  template({ match }: any) {
    return (
      <div class="match-item">
        <MatchRow match={match} onToggle={() => uiStore.toggleMatchAccordion(match.id)} />
        {uiStore.openMatchId === match.id ? (
          <div class="match-acc-body">
            {match.predictions.length === 0 ? (
              <div class="match-acc-empty">Bu maça tahmin girilmemiş.</div>
            ) : match.predictionsVisible ? (
              <div class="match-acc-list">
                {match.predictions.map((pred: any) => (
                  <PredRow key={pred.playerId} pred={pred} isLive={match.isLive} />
                ))}
                {match.isFinished ? (
                  <div class="pred-legend">
                    <span><i class="dot hit"></i>Doğru</span>
                    <span><i class="dot miss"></i>Yanlış</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div class="match-acc-sealed">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                <div>
                  <div class="match-acc-sealed-title">Tahminler maç başlayınca açılır</div>
                  <div class="match-acc-sealed-sub">Şu ana kadar {match.predictionCount} tahmin girildi.</div>
                  <div class="pred-sealed-avatars">
                    {match.predictions.map((p: any) => (
                      <Avatar key={p.playerId} color={p.color} initials={p.initials} size="sm" title={p.name} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    )
  }
}
