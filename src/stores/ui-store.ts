// UI durumu: maç detay sheet'i, kimlik seçimi, toast'lar.

import { Store } from '@geajs/core'
import leagueStore from './league-store'

const IDENTITY_KEY = 'tahminligi.identity'

class UiStore extends Store {
  sheetMatchId: string | null = null
  identityModalOpen = false
  toasts: Array<{ id: number; message: string }> = []
  identityId = ''

  private toastSeq = 0

  private playerIndex: Record<string, any> = {}

  constructor() {
    super()
    this.identityId = localStorage.getItem(IDENTITY_KEY) ?? ''
    leagueStore.observe('data', () => {
      const players: any[] = leagueStore.data?.players ?? []
      this.playerIndex = Object.fromEntries(players.map(p => [p.id, p]))
      if (this.identityId && !this.playerIndex[this.identityId]) {
        this.identityId = ''
        localStorage.removeItem(IDENTITY_KEY)
      }
    })
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

  setIdentity(playerId: string) {
    this.identityId = playerId
    if (playerId) localStorage.setItem(IDENTITY_KEY, playerId)
    else localStorage.removeItem(IDENTITY_KEY)
    this.identityModalOpen = false
  }

  get identity(): any | null {
    return this.playerIndex[this.identityId] ?? null
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
