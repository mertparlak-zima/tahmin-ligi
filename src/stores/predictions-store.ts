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

class PredictionsStore extends Store {
  /** Taslaklar: 'playerId:matchId' → 'H' | 'D' | 'A' | '' ('' = silme). */
  drafts: Record<string, string> = {}
  /** Kirli anahtarlar ('playerId:matchId'). Gea proksi güvenliği için her
   *  değişimde NESNE DEĞİŞTİREREK yazılır (add/delete yerine spread) —
   *  ui-store toasts deseni (kanıtlanmış yeniden render yolu). */
  private dirty: Record<string, true> = {}
  /** Kaydet sürerken o maçın düğmesi kilitli. */
  /** Maç başına kayıt sürüyor mu (#24 T3 review: paralel maç kayıtları). */
  saving: Record<string, boolean> = {}
  error: string | null = null

  /** Akordiyon içi "+ Oyuncu" satır formu (.open CSS deseni). */
  playerFormOpen = false
  playerForm = { name: '', color: PLAYER_COLORS[0] }
  playerSaving = false

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
   *  Başarı: kirli anahtarlar düşer + toast + sessiz lig tazelemesi ("girdi"
   *  rozetleri güncellenir). Hata: kirli satırlar korunur (yeniden denenebilir). */
  async saveMatch(matchId: string) {
    const byPlayer = new Map<string, Array<{ matchId: string; outcome: string }>>()
    const dirtyKeys: string[] = []
    for (const key of Object.keys(this.dirty)) {
      if (key.slice(key.indexOf(':') + 1) !== matchId) continue
      dirtyKeys.push(key)
      const playerId = key.slice(0, key.indexOf(':'))
      if (!byPlayer.has(playerId)) byPlayer.set(playerId, [])
      byPlayer.get(playerId).push({ matchId, outcome: this.drafts[key] ?? '' })
    }
    if (byPlayer.size === 0) return
    // Maç başına kayıt durumu (#24 T3 review): tek yuva iki maçın paralel
    // kaydında birbirinin düğmesini erken açıyordu — anahtar maçId olur.
    this.saving = { ...this.saving, [matchId]: true }
    try {
      await Promise.all(
        [...byPlayer.entries()].map(entry =>
          api('/api/predictions', {
            method: 'PUT',
            body: JSON.stringify({ playerId: entry[0], items: entry[1] }),
          }),
        ),
      )
      this.clearDirtyKeys(dirtyKeys)
      uiStore.toast('Tahminler kaydedildi.')
      leagueStore.load(true)
    } catch (err: any) {
      uiStore.toast(`Tahminler kaydedilemedi: ${err?.message ?? 'bilinmeyen hata'}`)
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
      uiStore.toast('Oyuncu adı en az 2 karakter olmalı.')
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
      uiStore.toast(err?.message ?? 'Oyuncu eklenemedi.')
    } finally {
      this.playerSaving = false
    }
  }
}

export default new PredictionsStore()
