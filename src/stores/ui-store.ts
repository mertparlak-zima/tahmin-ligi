// UI durumu: maç detay akordiyonu, toast'lar. (#24 sonrası: "Kimsin?"
// kimlik seçimi kaldırıldı — panel-siz modelde herkes herkes için girer;
// identityId alanı kalır ama hiçbir yerde ayarlanmaz, okuyanlar inerttir.
// Eski cihazlardaki kalıcı anahtar temizlenir.)

import { Store } from '@geajs/core'
import leagueStore from './league-store'
import { dateKey } from '../utils/format'

const LEGACY_IDENTITY_KEY = 'tahminligi.identity'

class UiStore extends Store {
  toasts: Array<{ id: number; message: string }> = []
  /** #24: artık ayarlanamaz (modal/düğmeler kaldırıldı) — hep ''. */
  identityId = ''
  /** Oyuncular sayfası detay görünümü (#20 U8): '' = kart listesi. */
  selectedPlayerId = ''
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

  /** Oyuncular detay görünümü (#20 U8): store metoduyla yazım — dışarıdan
   *  doğrudan alan ataması bu bileşende yeniden render tetiklemiyordu
   *  (openSheet/openIdentityModal deseni kanıtlanmış). */
  selectPlayer(playerId: string) {
    this.selectedPlayerId = playerId
  }

  closePlayerDetail() {
    this.selectedPlayerId = ''
  }

  /** Maç detay akordiyonu (#12 B): toggle — açık maçın id'si. */
  toggleMatchAccordion(matchId: string) {
    this.openMatchId = this.openMatchId === matchId ? null : matchId
  }

  closeMatchAccordion() {
    this.openMatchId = null
  }

  /** Tarih chip önizlemesi: hover'daki günün maçları (yalnız masaüstü hover). */
  openDatePreview(key: string, rect: { left: number; top: number; bottom: number; width: number }) {
    this.datePreviewKey = key
    this.datePreviewRect = rect
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

  toast(message: string) {
    const id = ++this.toastSeq
    this.toasts.push({ id, message })
    setTimeout(() => {
      this.toasts = this.toasts.filter(t => t.id !== id)
    }, 2600)
  }
}

export default new UiStore()
