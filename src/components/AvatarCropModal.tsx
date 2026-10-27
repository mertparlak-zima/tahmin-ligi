// Avatar kırpma modalı (#17 → #24 Faz 2: admin panelden oyuncu detayına
// taşındı; state avatar-store'da, uç POST/DELETE /api/players/avatar).
// Kare sahnede sürükle-kaydır + zoom; çıktı her zaman sabit 256×256 JPEG
// (yeniden kodlama → boyut öngörülebilir).
// Gea notları: kök her zaman render (.open deseni); görüntü konumlandırma ve
// pan/zoom dönüşümleri olay anında imperatif uygulanır (kural 10).

import { Component } from '@geajs/core'
import avatarStore from '../stores/avatar-store'

const STAGE = 240 // sahne kenarı (px)
const OUTPUT = 256 // çıktı çözünürlüğü

export default class AvatarCropModal extends Component {
  private stageImg: HTMLElement | null = null
  private panX = 0
  private panY = 0
  private dragging = false
  private dragFrom = { x: 0, y: 0, panX: 0, panY: 0 }

  /** Sahne görüntüsünü kur — OLAY ANINDA çağrılır (input change sonrası,
   *  re-render'in DOM'a düşmesini bekleyip). onAfterRender store kaynaklı
   *  re-render'larda çalışmadığı için burada güvenli kancayı event sağlıyor
   *  (bkv. DatePreviewPopover/Crest desenleri, AGENTS kural 10). */
  private syncStage() {
    if (!this.el) return
    this.stageImg = this.el.querySelector('.avatar-stage-img')
    this.panX = 0
    this.panY = 0
    this.applyTransform()
  }

  /** K = (S / min(nw, nh)) * zoom; pan kenarları taşırmayacak şekilde kısıtlanır. */
  private metrics() {
    const natural = avatarStore.natural
    const zoom = avatarStore.zoom
    const base = STAGE / Math.max(1, Math.min(natural.w, natural.h))
    const k = base * zoom
    const dispW = natural.w * k
    const dispH = natural.h * k
    const maxX = Math.max(0, (dispW - STAGE) / 2)
    const maxY = Math.max(0, (dispH - STAGE) / 2)
    const px = Math.min(maxX, Math.max(-maxX, this.panX))
    const py = Math.min(maxY, Math.max(-maxY, this.panY))
    return { k, dispW, dispH, px, py }
  }

  private applyTransform() {
    const el = this.stageImg
    if (!el) return
    if (!avatarStore.source) {
      el.style.backgroundImage = ''
      return
    }
    const m = this.metrics()
    el.style.backgroundImage = `url("${avatarStore.source}")`
    el.style.width = `${Math.round(m.dispW)}px`
    el.style.height = `${Math.round(m.dispH)}px`
    el.style.left = `${Math.round((STAGE - m.dispW) / 2 + m.px)}px`
    el.style.top = `${Math.round((STAGE - m.dispH) / 2 + m.py)}px`
  }

  private clampPan() {
    const m = this.metrics()
    this.panX = m.px
    this.panY = m.py
  }

  /** Sahnedeki görünen kareyi 256×256 JPEG'e kodlar. */
  private exportCrop(): string {
    const img = avatarStore.image
    if (!img) return ''
    const m = this.metrics()
    const left = (STAGE - m.dispW) / 2 + m.px
    const top = (STAGE - m.dispH) / 2 + m.py
    const sx = -left / m.k
    const sy = -top / m.k
    const sw = STAGE / m.k
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT
    canvas.height = OUTPUT
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.fillStyle = '#0b1829'
    ctx.fillRect(0, 0, OUTPUT, OUTPUT)
    ctx.drawImage(img, sx, sy, sw, sw, 0, 0, OUTPUT, OUTPUT)
    return canvas.toDataURL('image/jpeg', 0.87)
  }

  template() {
    const open = avatarStore.editorOpen
    const hasSource = avatarStore.source !== ''
    return (
      <div class={`modal-root${open ? ' open' : ''}`}>
        {open ? (
          <div>
            <div class="modal-backdrop" click={() => avatarStore.closeEditor()}></div>
            <div class="modal avatar-crop-modal" role="dialog" aria-modal="true" aria-label="Profil fotoğrafı">
              <div class="modal-title">Profil fotoğrafı</div>
              <div class="modal-sub">{avatarStore.playerName} — kareye kırp, ortala, kaydet.</div>

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                class="avatar-file-input"
                aria-label="Görüntü dosyası seç"
                change={async (e: any) => {
                  const input = e.target as HTMLInputElement
                  await avatarStore.pickFile(input.files?.[0] ?? null)
                  input.value = ''
                  // Re-render DOM'a düştükten sonra sahneyi imperatif kur.
                  setTimeout(() => this.syncStage(), 60)
                }}
              />

              {hasSource ? (
                <div
                  class="avatar-stage"
                  style={{ width: `${STAGE}px`, height: `${STAGE}px` } as any}
                  pointerdown={(e: any) => {
                    this.dragging = true
                    this.dragFrom = { x: e.clientX, y: e.clientY, panX: this.panX, panY: this.panY }
                    // Denetim turu (#31): bırakma sahnenin DIŞINDA olursa
                    // sürükleme takılı kalıyordu — pointerup/pointercancel
                    // pencereye bağlanır; handler kendi kendini temizler.
                    const endDrag = () => {
                      this.dragging = false
                      window.removeEventListener('pointerup', endDrag)
                      window.removeEventListener('pointercancel', endDrag)
                    }
                    window.addEventListener('pointerup', endDrag)
                    window.addEventListener('pointercancel', endDrag)
                  }}
                  pointermove={(e: any) => {
                    if (!this.dragging) return
                    this.panX = this.dragFrom.panX + (e.clientX - this.dragFrom.x)
                    this.panY = this.dragFrom.panY + (e.clientY - this.dragFrom.y)
                    this.clampPan()
                    this.applyTransform()
                  }}
                  pointerup={() => (this.dragging = false)}
                  pointercancel={() => (this.dragging = false)}
                >
                  <div class="avatar-stage-img" aria-hidden="true"></div>
                  <div class="avatar-stage-ring" aria-hidden="true"></div>
                </div>
              ) : (
                <button
                  class="avatar-dropzone"
                  click={() => {
                    const input = this.el?.querySelector('.avatar-file-input') as HTMLInputElement | null
                    input?.click()
                  }}
                >
                  <span class="avatar-dropzone-title">Dosya seç</span>
                  <span class="avatar-dropzone-sub">JPG / PNG / WebP · en fazla 10 MB · kırpma sonrası 256×256 kaydedilir</span>
                </button>
              )}

              {hasSource ? (
                <div class="avatar-zoom-row">
                  <span class="avatar-zoom-label">Zoom</span>
                  <input
                    class="avatar-zoom-range"
                    type="range"
                    min="1"
                    max="4"
                    step="0.05"
                    value={String(avatarStore.zoom)}
                    input={(e: any) => {
                      avatarStore.zoom = Number((e.target as HTMLInputElement).value)
                      this.clampPan()
                      this.applyTransform()
                    }}
                  />
                  <button
                    class="btn ghost sm"
                    click={() => {
                      const input = this.el?.querySelector('.avatar-file-input') as HTMLInputElement | null
                      input?.click()
                    }}
                  >
                    Değiştir
                  </button>
                </div>
              ) : null}

              {avatarStore.error ? <div class="error-box">{avatarStore.error}</div> : null}

              <div class="row-actions" style={{ marginTop: '14px' } as any}>
                <button class="btn ghost" click={() => avatarStore.closeEditor()}>Vazgeç</button>
                <button
                  class="btn primary"
                  disabled={!hasSource || avatarStore.saving}
                  click={() => avatarStore.save(this.exportCrop())}
                >
                  {avatarStore.saving ? 'Kaydediliyor…' : 'Kırp ve kaydet'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }
}
