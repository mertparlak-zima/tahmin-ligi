// İşlem Geçmişi (#40): /api/events verisi — "İşlem Geçmişi" sekmesinin
// store'u. Sayfa açılışında yüklenir (ensure — TTL'li tembel fetch);
// tahmin kaydından sonra predictions-store sessiz tazelemesi tetikler.
// Gizlilik: API yalnız MASKELİ IP döndürür; tam IP istemciye hiç gelmez.

import { Store } from '@geajs/core'

const REFRESH_TTL_MS = 60_000

class EventsStore extends Store {
  events: any[] = []
  loading = false
  loaded = false
  error = ''

  private lastFetch = 0

  /** Sayfa created() kancasından çağrılır: yüklenmemişse/ bayatsa çeker. */
  async ensure() {
    if (this.loading) return
    if (this.loaded && Date.now() - this.lastFetch < REFRESH_TTL_MS) return
    await this.refresh()
  }

  async refresh() {
    this.loading = true
    this.error = ''
    try {
      const res = await fetch('/api/events?limit=100', { cache: 'no-store' })
      const body = await res.json().catch(() => ({} as any))
      if (!res.ok) throw new Error(body?.error ?? `Sunucu ${res.status} döndü.`)
      this.events = body.events ?? []
      this.loaded = true
      this.lastFetch = Date.now()
    } catch (err: any) {
      this.error = err?.message ?? 'Bilinmeyen hata.'
    } finally {
      this.loading = false
    }
  }
}

export default new EventsStore()
