// /maho gizli sohbet sayfasının durumu: mesaj taslağı, opsiyonel görünen ad
// (son kullanılan ad cihazda saklanır) ve OTURUMLUK gönderilenler listesi.
// Liste yalnız client belleğidir — Discord'dan geri okuma YOKTUR; sayfa
// yenilenince boşalır (geçmiş kaydı yalnız sunucudaki manual_messages'dadır).

import { Store } from '@geajs/core'
import uiStore from './ui-store'

const MAX_TEXT = 2000 // api/lib-maho.js ile aynı sınır (Discord content)
const MAX_NAME = 80 // Discord username override sınırı
const NAME_KEY = 'tahminligi.maho.name'

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

/** Ham ağ hatalarını Türkçe dostça mesaja çevir (predictions-store deseni). */
function friendlyError(err: any): string {
  const msg = String(err?.message ?? '')
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(msg)) {
    return 'Bağlantı hatası — internet bağlantını kontrol edip tekrar dene.'
  }
  return msg || 'Bilinmeyen hata.'
}

class MahoStore extends Store {
  text = ''
  name = ''
  sending = false
  /** Bu oturumda gönderilenler (yeni gelen sonda — chat akışı). Yeniden
   *  render güvenliği için dizi her değişimde YENİ dizi olarak yazılır
   *  (toasts deseni). */
  sent: Array<{ id: number; text: string; name: string; at: string }> = []
  private seq = 0

  constructor() {
    super()
    try {
      const saved = localStorage.getItem(NAME_KEY)
      if (saved !== null) this.name = saved.slice(0, MAX_NAME)
    } catch {
      // private mod — sorun değil
    }
  }

  setText(value: string) {
    this.text = String(value ?? '').slice(0, MAX_TEXT)
  }

  setName(value: string) {
    this.name = String(value ?? '').slice(0, MAX_NAME)
    try {
      localStorage.setItem(NAME_KEY, this.name)
    } catch {
      // private mod — sorun değil
    }
  }

  get canSend(): boolean {
    return !this.sending && this.text.trim().length > 0
  }

  /** POST /api/maho → başarıda taslak temizlenir, oturum listesine düşer.
   *  Hata toast ile gösterilir; taslak KORUNUR (kullanıcı yeniden deneyebilir). */
  async send() {
    if (!this.canSend) return
    const text = this.text.trim()
    const name = this.name.trim()
    this.sending = true
    try {
      await api('/api/maho', { method: 'POST', body: JSON.stringify({ text, name }) })
      const at = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      this.sent = [...this.sent, { id: ++this.seq, text, name, at }]
      this.text = ''
      uiStore.toast('Gönderildi ✅')
    } catch (err: any) {
      uiStore.toast(friendlyError(err), 5200)
    } finally {
      this.sending = false
    }
  }
}

export default new MahoStore()
