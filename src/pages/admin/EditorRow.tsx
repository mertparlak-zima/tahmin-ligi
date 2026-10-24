// Maç akordiyonu (#20 U4): başlık tam genişlik düğme (Crest + kısa adlar +
// saat + uzun lig adı + durum + 'N/M tahmin' özeti + chevron); açıkken içerik
// ternary ile DOM'a girer (erken return yok, .open-CSS gizleme yok — plan U4).
// ŞABLON KÖKÜ HEP TEK ELEMENT — kök ternary Gea'da sessiz boş render verir
// (docs/gea-upstream-bugs.md #9 civarı; kanıtlanmış desen: tek kök + iç
// ternary). Kilitli maçlar bilgi satırı olarak kalır (gri, açılmaz). Görseller
// Crest imperatif deseniyle yüklenir (AGENTS kural 10 — <img> yok).

import { Component } from '@geajs/core'
import adminStore from '../../stores/admin-store'
import EditorPlayerRow from './EditorPlayerRow'
import Crest from '../../components/Crest'
import { fmtTime } from '../../utils/format'
import { cn } from '../../utils/cn'

function editorStatusText(match: any): string {
  if (match.statusGroup === 'inactive') return match.status === 'CANCELLED' ? 'İptal' : 'Ertelendi'
  if (match.locked && match.score) return `MS ${match.score.home}-${match.score.away}`
  if (match.locked) return 'Kilitli'
  return 'Yaklaşan'
}

export default class EditorRow extends Component {
  template({ match, locked = false }: any) {
    const open = adminStore.openMatchId === match.id
    const dirtyCount = adminStore.matchDirtyCount(match.id)
    const predicted = adminStore.matchPredictedCount(match.id)
    return (
      <div class={cn('acc-item', open && 'open', locked && 'locked-item')}>
        {locked ? (
          <div class="acc-locked-row">
            <span class="acc-locked-time">{fmtTime(match.kickoff)}</span>
            <Crest name={match.homeName} short={match.homeShort} crest={match.homeCrest} size={22} />
            <span class="acc-locked-teams">{match.homeShort} – {match.awayShort}</span>
            <Crest name={match.awayName} short={match.awayShort} crest={match.awayCrest} size={22} />
            <span class="acc-locked-status">
              <span class="lock-icon">🔒</span>
              {editorStatusText(match)}
            </span>
          </div>
        ) : (
          <div class="acc-main">
            <button
              class="acc-head"
              aria-expanded={open ? 'true' : 'false'}
              click={() => adminStore.toggleMatch(match.id)}
            >
              <span class="acc-teams">
                <Crest name={match.homeName} short={match.homeShort} crest={match.homeCrest} size={30} />
                <span class="acc-teams-name">{match.homeShort} – {match.awayShort}</span>
                <Crest name={match.awayName} short={match.awayShort} crest={match.awayCrest} size={30} />
              </span>
              <span class="acc-summary">{predicted}/{adminStore.activePlayerCount} tahmin</span>
              <i class="acc-chev" aria-hidden="true"></i>
              <span class="acc-meta">
                <span class="acc-meta-time">{fmtTime(match.kickoff)}</span>
                <span class="acc-meta-comp">{adminStore.competitionName(match.competitionCode)}</span>
                <span class="acc-meta-status">{editorStatusText(match)}</span>
              </span>
            </button>
            {open ? (
              <div class="acc-body">
                <div class="acc-longnames">
                  <span class="acc-longteam">
                    <Crest name={match.homeName} short={match.homeShort} crest={match.homeCrest} size={46} />
                    <span>{match.homeName}</span>
                  </span>
                  <span class="acc-long-vs">—</span>
                  <span class="acc-longteam">
                    <span>{match.awayName}</span>
                    <Crest name={match.awayName} short={match.awayShort} crest={match.awayCrest} size={46} />
                  </span>
                </div>
                <div class="acc-pred-list">
                  {adminStore.editorPlayers.length === 0 ? (
                    <div class="acc-empty">Aktif oyuncu yok — Oyuncular sekmesinden ekle.</div>
                  ) : (
                    adminStore.editorPlayers.map(player => (
                      <EditorPlayerRow key={player.id} player={player} match={match} />
                    ))
                  )}
                </div>
                <div class="acc-save">
                  <span class="acc-save-info">Değişiklikler yalnız bu maç için kaydedilir.</span>
                  <button
                    class="btn primary sm"
                    disabled={dirtyCount === 0 || adminStore.savingMatchId === match.id}
                    click={() => adminStore.saveMatch(match.id)}
                  >
                    {adminStore.savingMatchId === match.id
                      ? 'Kaydediliyor…'
                      : dirtyCount > 0
                        ? `Kaydet (${dirtyCount})`
                        : 'Kaydedildi'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    )
  }
}
