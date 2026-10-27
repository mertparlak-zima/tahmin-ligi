// Herkese açık tahmin giriş taslakları (#24 Faz 2): akordiyon içindeki
// giriş formunun durumu. Eski admin-store'daki 'playerId:matchId' taslak
// anahtarı düzeni korunur; şifreli uçlar yerine public uçlar çağrılır.
//
// MÜHÜR (seal) NOTU — baseline YOK: kickoff öncesi /api/league payload'ı
// tahminlerin SONUCUNU gizler (yalnız kimin girdiği görünür: match.predictions
// satırları outcome'suz gelir). Bu yüzden eski admin editöründeki gibi
// "mevcut değerden sapma" (baseline) hesaplanamaz; taslaklar tamamen
// EKLEMELİDİR (additive):
//   - satırda "girdi" rozeti varsa (match.predictions'da o oyuncu var) oyuncu
//     zaten tahmin girmiştir; yeni seçim yapıp kaydedince ÜZERİNE YAZILIR,
//   - temizle (✕) düğmesi taslağı '' yapar; kaydedince tahmin SİLİNİR
//     (PUT /api/predictions outcome='' = silme),
//   - payload'dan gelen değer bilinmediğinden "eski haline döndürme" yoktur.

import { Store } from '@geajs/core'
import leagueStore from './league-store'
import uiStore from './ui-store'

/** api/players.js PLAYER_COLORS ile aynı palet (ilk renk varsayılan). */
const PLAYER_COLORS = ['#b8f34a', '#5ce1e6', '#ff9f68', '#ffd05c', '#c792ea', '#f78fb3', '#39dfb2', '#6db6ff']

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    ...options,
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error ?? `Sunucu ${res.status} döndü`)
  return body
}

/** Denetim turu (#31): ham ağ hatalarını Türkçe dostça mesaja çevir. */
function friendlyError(err: any): string {
  const msg = String(err?.message ?? '')
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(msg)) {
    return 'Bağlantı hatası — internet bağlantını kontrol edip tekrar dene.'
  }
  return msg || 'Bilinmeyen hata.'
}

class PredictionsStore extends Store {
  /** Taslaklar: 'playerId:matchId' → 'H' | 'D' | 'A' | '' ('' = silme). */
  drafts: Record<string, string> = {}
  /** Kirli anahtarlar ('playerId:matchId'). Gea proksi güvenliği için her
   *  değişimde NESNE DEĞİŞTİREREK yazılır (add/delete yerine spread) —
   *  ui-store toasts deseni (kanıtlanmış yeniden render yolu). */
  private dirty: Record<string, true> = {}
  /** Maç başına kayıt sürüyor mu (#24 T3 review: paralel maç kayıtları). */
  saving: Record<string, boolean> = {}

  /** Akordiyon içi "+ Oyuncu" satır formu (.open CSS deseni). */
  playerFormOpen = false
  playerForm = { name: '', color: PLAYER_COLORS[0] }
  playerSaving = false

  /** Denetim turu (#31): oyuncu düzenle (PATCH) ve sil (DELETE) formları —
   *  uçlar hep vardı ama UI hiç bağlanmamıştı (typo'lu oyuncu kalıcıydı). */
  editOpen = false
  editForm = { id: '', name: '', color: PLAYER_COLORS[0] }
  editSaving = false
  deleteConfirmOpen = false
  deleteTargetId = ''
  deleteSaving = false

  get palette(): string[] {
    return PLAYER_COLORS
  }

  private static key(matchId: string, playerId: string): string {
    return `${playerId}:${matchId}`
  }

  setDraft(matchId: string, playerId: string, outcome: string) {
    const key = PredictionsStore.key(matchId, playerId)
    this.drafts = { ...this.drafts, [key]: outcome }
    this.dirty = { ...this.dirty, [key]: true }
  }

  clearDirty(matchId: string, playerId: string) {
    const key = PredictionsStore.key(matchId, playerId)
    if (!(key in this.dirty)) return
    const next = { ...this.dirty }
    delete next[key]
    this.dirty = next
  }

  private clearDirtyKeys(keys: string[]) {
    const next = { ...this.dirty }
    for (const key of keys) delete next[key]
    this.dirty = next
  }

  isDirty(matchId: string, playerId: string): boolean {
    return PredictionsStore.key(matchId, playerId) in this.dirty
  }

  /** Maçın kirli (kaydedilmemiş) satır sayısı — Kaydet düğmesi etiketi. */
  dirtyCount(matchId: string): number {
    let count = 0
    for (const key of Object.keys(this.dirty)) {
      if (key.slice(key.indexOf(':') + 1) === matchId) count++
    }
    return count
  }

  /** #24 Faz 2: tek maçın kirli taslaklarını oyuncu başına gruplayıp her
   *  oyuncu için AYRI PUT /api/predictions çağrısı yapar (gövde tek oyuncu
   *  taşır: {playerId, items:[{matchId, outcome}]}); hepsi paralel beklenir.
   *  Denetim turu (#31): OYUNCU BAŞINA sonuç toplanır — kısmi başarı artık
   *  topyekün başarısız gibi görünmez; 409'da (maç o sırada başladı) o
   *  oyuncunun öksüz dirty anahtarı düşer; ağ hatası dostça Türkçe çıkar.
   *  Başarı: kirli anahtarlar düşer + toast + sessiz lig tazelemesi. */
  async saveMatch(matchId: string) {
    const byPlayer = new Map<string, Array<{ matchId: string; outcome: string }>>()
    const keysByPlayer = new Map<string, string[]>()
    for (const key of Object.keys(this.dirty)) {
      if (key.slice(key.indexOf(':') + 1) !== matchId) continue
      const playerId = key.slice(0, key.indexOf(':'))
      if (!byPlayer.has(playerId)) {
        byPlayer.set(playerId, [])
        keysByPlayer.set(playerId, [])
      }
      byPlayer.get(playerId).push({ matchId, outcome: this.drafts[key] ?? '' })
      keysByPlayer.get(playerId).push(key)
    }
    if (byPlayer.size === 0) return
    const nameOf = (playerId: string) =>
      leagueStore.players.find((p: any) => p.id === playerId)?.name ?? 'Oyuncu'
    // Maç başına kayıt durumu (#24 T3 review): tek yuva iki maçın paralel
    // kaydında birbirinin düğmesini erken açıyordu — anahtar maçId olur.
    this.saving = { ...this.saving, [matchId]: true }
    try {
      const settled = await Promise.allSettled(
        [...byPlayer.entries()].map(entry =>
          api('/api/predictions', {
            method: 'PUT',
            body: JSON.stringify({ playerId: entry[0], items: entry[1] }),
          }),
        ),
      )
      const okKeys: string[] = []
      const lockedKeys: string[] = []
      const lockedNames: string[] = []
      const failedNames: string[] = []
      let failedReason = ''
      settled.forEach((result, index) => {
        const playerId = [...byPlayer.keys()][index]
        const keys = keysByPlayer.get(playerId) ?? []
        if (result.status === 'fulfilled') {
          okKeys.push(...keys)
        } else {
          const message = String(result.reason?.message ?? '')
          if (message.includes('Başlamış veya bitmiş')) {
            // Maç bu sırada başladı — bu taslak ARTIK kaydedilemez; öksüz
            // dirty anahtarı düşür, kilit toast'u çıkar.
            lockedNames.push(nameOf(playerId))
            lockedKeys.push(...keys)
          } else {
            failedNames.push(nameOf(playerId))
            failedReason = failedReason || friendlyError(result.reason)
          }
        }
      })
      if (okKeys.length > 0) this.clearDirtyKeys(okKeys)
      if (lockedKeys.length > 0) this.clearDirtyKeys(lockedKeys)
      const parts: string[] = []
      if (okKeys.length > 0) parts.push('Tahminler kaydedildi.')
      if (lockedNames.length > 0) {
        parts.push(`Maç başladı — ${lockedNames.join(', ')} için tahmin girişi kilitlendi.`)
      }
      if (failedNames.length > 0) {
        parts.push(`Kaydedilemedi: ${failedNames.join(', ')} — ${failedReason}`)
      }
      uiStore.toast(parts.join(' '), failedNames.length > 0 || lockedNames.length > 0 ? 5200 : 2600)
      if (okKeys.length > 0 || lockedKeys.length > 0) leagueStore.load(true)
    } finally {
      const next = { ...this.saving }
      delete next[matchId]
      this.saving = next
    }
  }

  openPlayerForm() {
    this.playerFormOpen = true
  }

  closePlayerForm() {
    this.playerFormOpen = false
  }

  setPlayerName(name: string) {
    this.playerForm = { ...this.playerForm, name }
  }

  setPlayerColor(color: string) {
    this.playerForm = { ...this.playerForm, color }
  }

  /** POST /api/players → sessiz tazeleme + toast. Form başarıda kapanır. */
  async createPlayer() {
    const name = this.playerForm.name.trim()
    if (name.length < 2) {
      uiStore.toast('Oyuncu adı en az 2 karakter olmalı.', 5200)
      return
    }
    this.playerSaving = true
    try {
      await api('/api/players', {
        method: 'POST',
        body: JSON.stringify({ name, color: this.playerForm.color }),
      })
      this.playerForm = { name: '', color: PLAYER_COLORS[0] }
      this.playerFormOpen = false
      uiStore.toast('Oyuncu eklendi.')
      leagueStore.load(true)
    } catch (err: any) {
      uiStore.toast(friendlyError(err), 5200)
    } finally {
      this.playerSaving = false
    }
  }

  // --- Denetim turu (#31): oyuncu düzenle/sil (PATCH/DELETE /api/players) ---

  openEdit(player: any) {
    if (!player) return
    this.editForm = { id: player.id, name: player.name, color: player.color ?? PLAYER_COLORS[0] }
    this.deleteConfirmOpen = false
    this.editOpen = true
  }

  closeEdit() {
    this.editOpen = false
  }

  setEditName(name: string) {
    this.editForm = { ...this.editForm, name }
  }

  setEditColor(color: string) {
    this.editForm = { ...this.editForm, color }
  }

  /** PATCH /api/players — ad/renk. Başarıda panel kapanır + tazeleme. */
  async saveEdit() {
    const name = this.editForm.name.trim()
    if (name.length < 2) {
      uiStore.toast('Oyuncu adı en az 2 karakter olmalı.', 5200)
      return
    }
    this.editSaving = true
    try {
      await api('/api/players', {
        method: 'PATCH',
        body: JSON.stringify({ id: this.editForm.id, name, color: this.editForm.color }),
      })
      this.editOpen = false
      uiStore.toast('Oyuncu güncellendi.')
      leagueStore.load(true)
    } catch (err: any) {
      uiStore.toast(friendlyError(err), 5200)
    } finally {
      this.editSaving = false
    }
  }

  /** Sil onayı: ikinci adım panel (.open deseni). */
  askDeletePlayer(player: any) {
    if (!player) return
    this.deleteTargetId = player.id
    this.editOpen = false
    this.deleteConfirmOpen = true
  }

  cancelDeletePlayer() {
    this.deleteConfirmOpen = false
    this.deleteTargetId = ''
  }

  /** DELETE /api/players — tahminli oyuncu API'den 409 ile döner (mesajı
   *  aynen gösterilir: "N tahmini var; önce tahminleri silin"). Başarıda
   *  silinen oyuncunun taslak/kirli anahtarları da düşürülür (T3 review:
   *  hayalet "Kaydet (N)" sayacı kalıyordu). */
  async confirmDeletePlayer() {
    if (!this.deleteTargetId) return
    this.deleteSaving = true
    try {
      await api('/api/players', {
        method: 'DELETE',
        body: JSON.stringify({ id: this.deleteTargetId }),
      })
      const prefix = `${this.deleteTargetId}:`
      const drafts = { ...this.drafts }
      for (const key of Object.keys(drafts)) {
        if (key.startsWith(prefix)) delete drafts[key]
      }
      this.drafts = drafts
      this.clearDirtyKeys(Object.keys(this.dirty).filter(key => key.startsWith(prefix)))
      this.deleteConfirmOpen = false
      this.deleteTargetId = ''
      leagueStore.closePlayerDetail()
      uiStore.toast('Oyuncu silindi.')
      leagueStore.load(true)
    } catch (err: any) {
      uiStore.toast(friendlyError(err), 5200)
    } finally {
      this.deleteSaving = false
    }
  }
}

export default new PredictionsStore()
