// UI durumu: maç detay sheet'i, kimlik seçimi, toast'lar.

import { Store } from '@geajs/core'
import leagueStore from './league-store'
import { dateKey } from '../utils/format'

const IDENTITY_KEY = 'tahminligi.identity'

class UiStore extends Store {
  sheetMatchId: string | null = null
  identityModalOpen = false
  toasts: Array<{ id: number; message: string }> = []
  identityId = ''
  /** Oyuncular sayfası detay görünümü (#20 U8): '' = kart listesi. */
  selectedPlayerId = ''
  datePreviewKey = ''
  datePreviewRect: { left: number; top: number; bottom: number; width: number } | null = null

  private toastSeq = 0

  private playerIndex: Record<string, any> = {}

  constructor() {
    super()
    this.identityId = localStorage.getItem(IDENTITY_KEY) ?? ''
    // Önbellek hidrasyonu (#16) data'yı gözlemciler kurulmadan önce
    // doldurabiliyor; 304 yolu da data atlamadığı için observe tetiklenmez.
    // Bu yüzden indeks HEMEN hem de her data değişiminde yeniden kurulur.
    const rebuildIndex = () => {
      const players: any[] = leagueStore.data?.players ?? []
      this.playerIndex = Object.fromEntries(players.map(p => [p.id, p]))
      if (this.identityId && !this.playerIndex[this.identityId]) {
        this.identityId = ''
        localStorage.removeItem(IDENTITY_KEY)
      }
    }
    rebuildIndex()
    leagueStore.observe('data', rebuildIndex)
  }

  openSheet(matchId: string) {
    this.sheetMatchId = matchId
    document.body.classList.add('sheet-open')
  }

  closeSheet() {
    this.sheetMatchId = null
    document.body.classList.remove('sheet-open')
  }

  openIdentityModal() {
    this.identityModalOpen = true
  }

  closeIdentityModal() {
    this.identityModalOpen = false
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

  /** Tarih chip önizlemesi: hover'daki günün maçları (yalnız masaüstü hover). */
  openDatePreview(key: string, rect: { left: number; top: number; bottom: number; width: number }) {
    this.datePreviewKey = key
    this.datePreviewRect = rect
  }

  closeDatePreview() {
    this.datePreviewKey = ''
  }

  setIdentity(playerId: string) {
    this.identityId = playerId
    if (playerId) localStorage.setItem(IDENTITY_KEY, playerId)
    else localStorage.removeItem(IDENTITY_KEY)
    this.identityModalOpen = false
  }

  get identity(): any | null {
    return this.playerIndex[this.identityId] ?? null
  }

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
