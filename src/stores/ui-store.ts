// UI durumu: maç detay akordiyonu, toast'lar, oyuncu detay görünümü.
// (#24 sonrası "Kimsin?" kimlik seçiği kaldırıldı — panel-siz modelde
// herkes herkes için girer. Denetim turu #31: inert identityId alanı da
// tarihe karıştı; eski cihazlardaki kalıcı anahtar yine temizlenir.)

import { Store } from '@geajs/core'
import leagueStore from './league-store'
import { dateKey } from '../utils/format'

const LEGACY_IDENTITY_KEY = 'tahminligi.identity'

class UiStore extends Store {
  toasts: Array<{ id: number; message: string }> = []
  /** Maç detay akordiyonu (#12 B): açık maçın id'si; null = kapalı. */
  openMatchId: string | null = null
  datePreviewKey = ''
  datePreviewRect: { left: number; top: number; bottom: number; width: number } | null = null

  private toastSeq = 0

  constructor() {
    super()
    try {
      localStorage.removeItem(LEGACY_IDENTITY_KEY)
    } catch {
      // private mod — sorun değil
    }
    // Not (#16 tarihi): burada eskiden data-observe ile oyuncu indeksi
    // kuruluyordu (kimlik doğrulaması için) — #24 ile kimlik akışı kalkınca
    // indeks de kaldırıldı.
  }

  /** Maç detay akordiyonu (#12 B): toggle — açık maçın id'si. */
  toggleMatchAccordion(matchId: string) {
    this.openMatchId = this.openMatchId === matchId ? null : matchId
  }

  /** Denetim turu (#31): oyuncu kartındaki tahmin kartından maça giderken
   *  akordiyonu AÇ (toggle değil — tekrar tıklamada kapanmasın). */
  openMatch(matchId: string) {
    this.openMatchId = matchId
  }

  closeMatchAccordion() {
    this.openMatchId = null
  }

  // Not (#31): oyuncu detay görünümü league-store'dadır (selectedPlayerId/
  // selectPlayer/closePlayerDetail) — buradaki eski ölü kopyalar kaldırıldı.

  /** Tarih chip önizlemesi: hover'daki günün maçları (yalnız masaüstü hover).
   *  Denetim turu (#31): sabit konumlu popover'ın left/top'si hiç atanmıyordu
   *  (sayfa dibinde görünmezdi) — rect burada imperatif uygulanır (Crest
   *  deseni: handler DOM işi Gea-güvenli). */
  openDatePreview(key: string, rect: { left: number; top: number; bottom: number; width: number }) {
    this.datePreviewKey = key
    this.datePreviewRect = rect
    const el = document.getElementById('date-preview-popover')
    if (el) {
      const half = el.offsetWidth / 2 || 110
      const left = Math.max(half + 8, Math.min(rect.left + rect.width / 2, window.innerWidth - half - 8))
      el.style.left = `${Math.round(left)}px`
      // Üstte yer varsa chip'in ÜSTÜNE, yoksa ALTINA (below sınıfı transformu
      // çevirir — CSS ile eşleşir).
      el.style.top = rect.top >= 220 ? `${Math.round(rect.top)}px` : `${Math.round(rect.bottom)}px`
    }
  }

  closeDatePreview() {
    this.datePreviewKey = ''
  }

  // #24: setIdentity/openIdentityModal/closeIdentityModal ve identityModalOpen
  // kaldırıldı (kimlik akışı yok); "identity" getter'ı da kullanımsızlaştı.

  /** Oyuncunun açılmış tahminleri: bitmişler (yeniden eskiye) + başlamışlar (yakına). */
  playerMatches(playerId: string): any[] {
    if (!playerId) return []
    const matches: any[] = leagueStore.data?.matches ?? []
    const mine = matches.filter(m => m.predictions.some((p: any) => p.playerId === playerId))
    const revealed = mine.filter(m => m.predictionsVisible)
    const finished = revealed
      .filter(m => m.isFinished)
      .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff))
    const started = revealed
      .filter(m => !m.isFinished)
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
    return [...finished, ...started]
  }

  /** Oyuncunun mühürlü (henüz açılmamış) tahmin sayısı. */
  sealedCountOf(playerId: string): number {
    if (!playerId) return 0
    const matches: any[] = leagueStore.data?.matches ?? []
    return matches.filter(
      m => !m.predictionsVisible && m.predictions.some((p: any) => p.playerId === playerId)
    ).length
  }

  /** Oyuncunun tahmin GİRMEDİĞİ bitmemiş maçlar (#20 U8) — kimin girmediği
   *  herkese açık bilgidir; outcome söz konusu değildir (mühürle çelişmez). */
  missingMatches(playerId: string): any[] {
    if (!playerId) return []
    const matches: any[] = leagueStore.data?.matches ?? []
    return matches.filter(
      m => !m.isStarted && !m.isFinished && m.statusGroup !== 'inactive'
        && !m.predictions.some((p: any) => p.playerId === playerId)
    )
  }

  /** Denetim turu (#31): hatalar daha uzun kalır + tıklayınca kapanır. */
  toast(message: string, durationMs = 2600) {
    const id = ++this.toastSeq
    this.toasts = [...this.toasts, { id, message }]
    setTimeout(() => {
      this.toasts = this.toasts.filter(t => t.id !== id)
    }, durationMs)
  }

  dismissToast(id: number) {
    this.toasts = this.toasts.filter(t => t.id !== id)
  }
}

export default new UiStore()
