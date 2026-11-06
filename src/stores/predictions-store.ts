// Herkese açık tahmin giriş taslakları (#24 Faz 2): akordiyon içindeki
// giriş formunun durumu. 'playerId:matchId' taslak anahtarı düzeni korunur;
// şifreli uçlar yerine public uçlar çağrılır.
//
// #39 BASELINE NOTU — mühür kalktı: /api/league payload'ı kickoff öncesi de
// tahmin DEĞERİNİ (outcome) taşır. Böylece sunucudaki kayıtlı değer
// (baseline) bilinir; taslaklar "additive" değil SAPMA temelli çalışır:
//   - satır seçimi görüntüsü = yerel taslak VARSA taslak, YOKSA sunucu değeri
//     (başka cihazdan girilen seçim de seçili görünür),
//   - kirli (dirty) = taslak, sunucudaki değerden FARKLI ise (H→H no-op
//     kayda girmez; Kaydet düğmesi ve PUT gereksiz tetiklenmez),
//   - temizle (✕) taslağı '' yapar; kaydedince tahmin SİLİNİR
//     (PUT /api/predictions outcome='' = silme).

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
  /** Taslaklar: 'playerId:matchId' → 'H' | 'D' | 'A' | '' ('' = silme).
   * Anahtar YOKSA satıra hiç dokunulmamıştır → seçim sunucu değerinden
   * gösterilir (#39 baseline). Gea proksi güvenliği için her değişimde
   * NESNE DEĞİŞTİREREK yazılır (spread) — ui-store toasts deseni. */
  drafts: Record<string, string> = {}
  /** Maç başına kayıt sürüyor mu (#24 T3 review: paralel maç kayıtları). */
  saving: Record<string, boolean> = {}

  /** Akordiyon içi "+ Oyuncu" satır formu (.open CSS deseni). */
  playerFormOpen = false
  playerForm = { name: '', color: PLAYER_COLORS[0] }
  playerSaving = false

  /** Denetim turu (#31): oyuncu düzenleme formu (PATCH /api/players) — uç
   *  vardı ama UI'a hiç bağlanmamıştı (typo'lu oyuncu kalıcıydı).
   *  Not: SİLME kullanıcı talebiyle UI'da YOK (API ucu kalır). */
  editOpen = false
  editForm = { id: '', name: '', color: PLAYER_COLORS[0] }
  editSaving = false

  get palette(): string[] {
    return PLAYER_COLORS
  }

  private static key(matchId: string, playerId: string): string {
    return `${playerId}:${matchId}`
  }

  setDraft(matchId: string, playerId: string, outcome: string) {
    const key = PredictionsStore.key(matchId, playerId)
    this.drafts = { ...this.drafts, [key]: outcome }
  }

  /** Sunucudaki kayıtlı değer (#39 baseline): kickoff öncesi de payload'dan
   *  okunur. Satır yoksa undefined ('' ile karışmaz — '' "silinecek" demektir). */
  savedOutcome(matchId: string, playerId: string): string | undefined {
    const match = (leagueStore.data?.matches ?? []).find((m: any) => m.id === matchId)
    const row = (match?.predictions ?? []).find((p: any) => p.playerId === playerId)
    return row?.outcome ?? undefined
  }

  isDirty(matchId: string, playerId: string): boolean {
    const key = PredictionsStore.key(matchId, playerId)
    return key in this.drafts && this.drafts[key] !== this.savedOutcome(matchId, playerId)
  }

  /** Maçın kirli (kaydedilmemiş) satır sayısı — Kaydet düğmesi etiketi. */
  dirtyCount(matchId: string): number {
    let count = 0
    for (const key of Object.keys(this.drafts)) {
      if (key.slice(key.indexOf(':') + 1) !== matchId) continue
      const playerId = key.slice(0, key.indexOf(':'))
      if (this.isDirty(matchId, playerId)) count++
    }
    return count
  }

  /** Kayıt/silme sonrası taslak anahtarlarını düşür — satır sunucu değerine
   *  döner (baseline). Gea proksi güvenliği: spread + delete yerine yeni nesne. */
  private dropDraftKeys(keys: string[]) {
    if (keys.length === 0) return
    const next = { ...this.drafts }
    for (const key of keys) delete next[key]
    this.drafts = next
  }

  /** #24 Faz 2: tek maçın kirli taslaklarını oyuncu başına gruplayıp her
   *  oyuncu için AYRI PUT /api/predictions çağrısı yapar (gövde tek oyuncu
   *  taşır: {playerId, items:[{matchId, outcome}]}); hepsi paralel beklenir.
   *  Denetim turu (#31): OYUNCU BAŞINA sonuç toplanır — kısmi başarı artık
   *  topyekün başarısız gibi görünmez; 409'da (maç o sırada başladı) o
   *  oyuncunun öksüz taslağı düşer; ağ hatası dostça Türkçe çıkar.
   *  Başarı: taslak anahtarları düşer + toast + sessiz lig tazelemesi. */
  async saveMatch(matchId: string) {
    const byPlayer = new Map<string, Array<{ matchId: string; outcome: string }>>()
    const keysByPlayer = new Map<string, string[]>()
    for (const key of Object.keys(this.drafts)) {
      if (key.slice(key.indexOf(':') + 1) !== matchId) continue
      const playerId = key.slice(0, key.indexOf(':'))
      // #39: taslak sunucu değeriyle AYNI ise no-op — PUT'a hiç girmez.
      if (!this.isDirty(matchId, playerId)) continue
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
            // taslak anahtarını düşür (satır sunucu değerine döner), kilit
            // toast'u çıkar.
            lockedNames.push(nameOf(playerId))
            lockedKeys.push(...keys)
          } else {
            failedNames.push(nameOf(playerId))
            failedReason = failedReason || friendlyError(result.reason)
          }
        }
      })
      if (okKeys.length > 0) this.dropDraftKeys(okKeys)
      if (lockedKeys.length > 0) this.dropDraftKeys(lockedKeys)
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
}

export default new PredictionsStore()
