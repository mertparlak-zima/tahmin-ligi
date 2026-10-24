// Yönetim paneli durumu: oturum, bootstrap verisi, tahmin editörü taslakları.

import { Store } from '@geajs/core'
import uiStore from './ui-store'
import { dateKey } from '../utils/format'

const ADMIN_KEY = 'tahminligi.admin'

function groupByDay(matches: any[]): Array<{ day: string; matches: any[] }> {
  const byDay = new Map<string, any[]>()
  for (const match of matches) {
    const key = dateKey(match.kickoff)
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(match)
  }
  return [...byDay.entries()].map(entry => ({ day: entry[0], matches: entry[1] }))
}

async function api(path: string, options: RequestInit = {}) {
  const password = sessionStorage.getItem(ADMIN_KEY) ?? ''
  const res = await fetch(path, {
    ...options,
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(password ? { authorization: `Bearer ${password}` } : {}),
      ...(options.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error ?? `Sunucu ${res.status} döndü`)
  return body
}

class AdminStore extends Store {
  password = ''
  authed = false
  data: any = null
  loading = false
  error: string | null = null

  tab = 'predictions'
  editorPlayerId = ''
  showLocked = false
  drafts: Record<string, string> = {}
  baseline: Record<string, string> = {}

  saving = false
  syncRunning = false
  playerForm = { name: '', color: '#b8f34a' }
  scoringForm = { label: '', status: 'provisional', correctOutcome: 1 }

  // --- Avatar editörü (#17) ---
  avatarEditorOpen = false
  avatarPlayerId = ''
  avatarPlayerName = ''
  avatarSource = '' // orijinal görüntü dataUrl'i
  avatarNatural = { w: 0, h: 0 }
  avatarImage: any = null // decode edilmiş HTMLImageElement (kırpma export'u için)
  avatarZoom = 1
  avatarSaving = false
  avatarError: string | null = null

  constructor() {
    super()
    this.password = sessionStorage.getItem(ADMIN_KEY) ?? ''
    this.authed = Boolean(this.password)
  }

  async login(password: string) {
    this.loading = true
    this.error = null
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) })
      this.password = password
      this.authed = true
      sessionStorage.setItem(ADMIN_KEY, password)
      await this.bootstrap()
    } catch (err: any) {
      this.error = err.message
    } finally {
      this.loading = false
    }
  }

  logout() {
    this.password = ''
    this.authed = false
    this.data = null
    this.drafts = {}
    this.baseline = {}
    sessionStorage.removeItem(ADMIN_KEY)
  }

  async bootstrap() {
    this.loading = true
    try {
      this.data = await api('/api/admin/bootstrap')
      this.error = null
      this.ensureEditorPlayer()
      this.resetDrafts()
      this.syncScoringForm()
    } catch (err: any) {
      this.error = err.message
      if (/Yetkisiz|401/.test(err.message)) this.logout()
    } finally {
      this.loading = false
    }
  }

  private ensureEditorPlayer() {
    const players: any[] = this.data?.players ?? []
    if (!players.length) {
      this.editorPlayerId = ''
      return
    }
    if (!players.some(p => p.id === this.editorPlayerId)) {
      this.editorPlayerId = players[0].id
    }
  }

  private resetDrafts() {
    const map = this.data?.predictions ?? {}
    const playerId = this.editorPlayerId
    const drafts: Record<string, string> = {}
    const baseline: Record<string, string> = {}
    for (const [key, outcome] of Object.entries(map)) {
      const [pid, mid] = key.split(':')
      if (pid !== playerId) continue
      drafts[mid] = outcome as string
      baseline[mid] = outcome as string
    }
    this.drafts = drafts
    this.baseline = baseline
  }

  setEditorPlayer(playerId: string) {
    this.editorPlayerId = playerId
    this.resetDrafts()
  }

  toggleLocked() {
    this.showLocked = !this.showLocked
  }

  setDraft(matchId: string, outcome: string) {
    this.drafts[matchId] = outcome
  }

  get editorMatches(): any[] {
    const matches: any[] = this.data?.matches ?? []
    return matches.filter(m => !m.locked).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
  }

  get players(): any[] {
    return this.data?.players ?? []
  }

  get openMatchCount(): number {
    return this.editorMatches.length
  }

  get lockedMatchCount(): number {
    return (this.data?.matches ?? []).filter(m => m.locked).length
  }

  /** Tahmine açık maçlar, gün bazında (yakından uzağa). */
  get editorDays(): Array<{ day: string; matches: any[] }> {
    return groupByDay(this.editorMatches)
  }

  /** Kilitli (bitmiş/başlamış/ertelenmiş) maçlar, gün bazında (yeniden eskiye). */
  get lockedDays(): Array<{ day: string; matches: any[] }> {
    const locked = (this.data?.matches ?? [])
      .filter(m => m.locked)
      .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff))
    return groupByDay(locked)
  }

  get dirtyItems(): Array<{ matchId: string; outcome: string }> {
    const items = []
    for (const matchId of Object.keys(this.drafts)) {
      if ((this.drafts[matchId] ?? '') !== (this.baseline[matchId] ?? '')) {
        items.push({ matchId, outcome: this.drafts[matchId] ?? '' })
      }
    }
    for (const matchId of Object.keys(this.baseline)) {
      if (!(matchId in this.drafts) && this.baseline[matchId] !== '') {
        items.push({ matchId, outcome: '' })
      }
    }
    // Locked olmayan maçlarda kalan değişiklikler
    const locked = new Set((this.data?.matches ?? []).filter((m: any) => m.locked).map((m: any) => m.id))
    return items.filter(i => !locked.has(i.matchId))
  }

  get dirtyCount(): number {
    return this.dirtyItems.length
  }

  async savePredictions() {
    const items = this.dirtyItems
    if (items.length === 0) return
    this.saving = true
    try {
      const result = await api('/api/admin/predictions', {
        method: 'PUT',
        body: JSON.stringify({ playerId: this.editorPlayerId, items }),
      })
      uiStore.toast(`Tahminler kaydedildi (${result.saved} kayıt, ${result.deleted ?? 0} silme).`)
      await this.bootstrap()
    } catch (err: any) {
      uiStore.toast(`Kaydedilemedi: ${err.message}`)
    } finally {
      this.saving = false
    }
  }

  async addPlayer(name: string, color: string) {
    try {
      await api('/api/admin/players', { method: 'POST', body: JSON.stringify({ name, color }) })
      uiStore.toast('Oyuncu eklendi.')
      this.playerForm = { name: '', color: '#b8f34a' }
      await this.bootstrap()
    } catch (err: any) {
      uiStore.toast(err.message)
    }
  }

  async togglePlayer(player: any) {
    try {
      await api('/api/admin/players', {
        method: 'PATCH',
        body: JSON.stringify({ id: player.id, isActive: !player.isActive }),
      })
      uiStore.toast(player.isActive ? `${player.name} pasife alındı.` : `${player.name} aktifleştirildi.`)
      await this.bootstrap()
    } catch (err: any) {
      uiStore.toast(err.message)
    }
  }

  // --- Avatar (#17) ---

  openAvatarEditor(player: any) {
    this.avatarPlayerId = player.id
    this.avatarPlayerName = player.name
    this.avatarSource = ''
    this.avatarNatural = { w: 0, h: 0 }
    this.avatarZoom = 1
    this.avatarError = null
    this.avatarEditorOpen = true
  }

  closeAvatarEditor() {
    this.avatarEditorOpen = false
    this.avatarSource = ''
    this.avatarError = null
  }

  /** Dosya ön doğrulaması (format/boyut/çözünürlük) + dataUrl'e okuma. */
  async pickAvatarFile(file: File | null) {
    if (!file) return
    this.avatarError = null
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.avatarError = 'Dosya JPG, PNG veya WebP olmalı.'
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      this.avatarError = 'Dosya 10 MB\u2019dan büyük olamaz.'
      return
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Dosya okunamadı.'))
      reader.readAsDataURL(file)
    }).catch(() => '')
    if (!dataUrl) {
      this.avatarError = 'Dosya okunamadı.'
      return
    }
    const natural = await new Promise<{ w: number; h: number; img: any }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight, img })
      img.onerror = () => reject(new Error('Görüntü açılamadı.'))
      img.src = dataUrl
    }).catch(() => null)
    if (!natural) {
      this.avatarError = 'Görüntü açılamadı.'
      return
    }
    if (natural.w < 64 || natural.h < 64) {
      this.avatarError = 'Görüntü çok küçük (en az 64×64 piksel).'
      return
    }
    if (natural.w > 8000 || natural.h > 8000) {
      this.avatarError = 'Görüntü çok büyük (en fazla 8000×8000 piksel).'
      return
    }
    this.avatarSource = dataUrl
    this.avatarNatural = { w: natural.w, h: natural.h }
    this.avatarImage = natural.img
    this.avatarZoom = 1
  }

  /** Kırpılmış 256×256 JPEG dataUrl'ini yükler (kırpma modalı üretir). */
  async saveAvatar(dataUrl: string) {
    if (!dataUrl) return
    this.avatarSaving = true
    this.avatarError = null
    try {
      await api('/api/admin/players/avatar', {
        method: 'PUT',
        body: JSON.stringify({ playerId: this.avatarPlayerId, dataUrl }),
      })
      uiStore.toast('Profil fotoğrafı güncellendi.')
      this.closeAvatarEditor()
      await this.bootstrap()
    } catch (err: any) {
      this.avatarError = err.message
    } finally {
      this.avatarSaving = false
    }
  }

  async removeAvatar(playerId: string) {
    try {
      await api('/api/admin/players/avatar', {
        method: 'DELETE',
        body: JSON.stringify({ playerId }),
      })
      uiStore.toast('Profil fotoğrafı kaldırıldı.')
      await this.bootstrap()
    } catch (err: any) {
      uiStore.toast(err.message)
    }
  }

  syncScoringForm() {
    const s = this.data?.scoring
    if (s) this.scoringForm = { label: s.label, status: s.status, correctOutcome: s.correctOutcome }
  }

  async saveScoring() {
    try {
      await api('/api/admin/scoring', {
        method: 'PUT',
        body: JSON.stringify(this.scoringForm),
      })
      uiStore.toast('Puanlama güncellendi. Puan tablosu yeniden hesaplandı.')
      await this.bootstrap()
    } catch (err: any) {
      uiStore.toast(err.message)
    }
  }

  async syncNow() {
    this.syncRunning = true
    try {
      const result = await api('/api/admin/sync', { method: 'POST' })
      uiStore.toast(`Senkronizasyon tamam: ${result.matchesSeen} maç, ${result.changed} değişiklik.`)
      await this.bootstrap()
    } catch (err: any) {
      uiStore.toast(`Senkronizasyon hatası: ${err.message}`)
    } finally {
      this.syncRunning = false
    }
  }
}

export default new AdminStore()
