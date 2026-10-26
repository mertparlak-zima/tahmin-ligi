// Profil fotoğrafı editörü durumu (#17 → #24 Faz 2 taşındı): kırpma
// modalının state'i + public /api/players/avatar uçları (POST yükle ·
// DELETE kaldır). Eski admin-store'un avatar bölümünün yerine geçer;
// alan/metot adları korunur (AvatarCropModal minimum diff ile taşındı).

import { Store } from '@geajs/core'
import leagueStore from './league-store'
import uiStore from './ui-store'

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

class AvatarStore extends Store {
  editorOpen = false
  playerId = ''
  playerName = ''
  source = '' // orijinal görüntü dataUrl'i
  natural = { w: 0, h: 0 }
  image: any = null // decode edilmiş HTMLImageElement (kırpma export'u için)
  zoom = 1
  saving = false
  error: string | null = null

  openEditor(player: any) {
    if (!player) return
    this.playerId = player.id
    this.playerName = player.name
    this.source = ''
    this.natural = { w: 0, h: 0 }
    this.image = null
    this.zoom = 1
    this.error = null
    this.editorOpen = true
  }

  closeEditor() {
    this.editorOpen = false
    this.source = ''
    this.error = null
  }

  /** Dosya ön doğrulaması (format/boyut/çözünürlük) + dataUrl'e okuma. */
  async pickFile(file: File | null) {
    if (!file) return
    this.error = null
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.error = 'Dosya JPG, PNG veya WebP olmalı.'
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      this.error = 'Dosya 10 MB\u2019dan büyük olamaz.'
      return
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Dosya okunamadı.'))
      reader.readAsDataURL(file)
    }).catch(() => '')
    if (!dataUrl) {
      this.error = 'Dosya okunamadı.'
      return
    }
    const natural = await new Promise<{ w: number; h: number; img: any }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight, img })
      img.onerror = () => reject(new Error('Görüntü açılamadı.'))
      img.src = dataUrl
    }).catch(() => null)
    if (!natural) {
      this.error = 'Görüntü açılamadı.'
      return
    }
    if (natural.w < 64 || natural.h < 64) {
      this.error = 'Görüntü çok küçük (en az 64×64 piksel).'
      return
    }
    if (natural.w > 8000 || natural.h > 8000) {
      this.error = 'Görüntü çok büyük (en fazla 8000×8000 piksel).'
      return
    }
    this.source = dataUrl
    this.natural = { w: natural.w, h: natural.h }
    this.image = natural.img
    this.zoom = 1
  }

  /** Kırpılmış 256×256 JPEG dataUrl'ini yükler (kırpma modalı üretir).
   *  #24 Faz 2: PUT /api/admin/players/avatar → POST /api/players/avatar. */
  async save(dataUrl: string) {
    if (!dataUrl) return
    this.saving = true
    this.error = null
    try {
      await api('/api/players/avatar', {
        method: 'POST',
        body: JSON.stringify({ playerId: this.playerId, dataUrl }),
      })
      uiStore.toast('Profil fotoğrafı güncellendi.')
      this.closeEditor()
      leagueStore.load(true)
    } catch (err: any) {
      this.error = err?.message ?? 'Profil fotoğrafı güncellenemedi.'
    } finally {
      this.saving = false
    }
  }

  async remove(playerId: string) {
    try {
      await api('/api/players/avatar', {
        method: 'DELETE',
        body: JSON.stringify({ playerId }),
      })
      uiStore.toast('Profil fotoğrafı kaldırıldı.')
      leagueStore.load(true)
    } catch (err: any) {
      uiStore.toast(err?.message ?? 'Profil fotoğrafı kaldırılamadı.')
    }
  }
}

export default new AvatarStore()
