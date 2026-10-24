// Ortak avatar: foto + (yoksa/bozuksa) renk + baş harfler.
// Foto katmanı her zaman render edilir; background-image yalnız URL varken
// imperatif atanır (bkv. Crest deseni, AGENTS kural 10 — prop-zincirli src
// binding'leri güvenilmez). Foto yüklenemezse arkadaki baş harfler kalır.

import { Component } from '@geajs/core'

export default class Avatar extends Component {
  photoUrl = ''

  onAfterRender() {
    if (!this.el) return
    const layer = this.el.querySelector('.avatar-photo')
    if (!layer) return
    const url = this.photoUrl
    // URL'i render anında prop'tan oku — kanıtlanmış güvenilir (bkv. upstream #9).
    if (url && url !== 'null') {
      layer.style.backgroundImage = `url("${url}")`
    } else {
      layer.style.backgroundImage = ''
    }
  }

  template({ color, initials, size = '', title = '', photo = null }: any) {
    this.photoUrl = String(photo ?? '')
    const cls = `avatar${size ? ` ${size}` : ''}`
    return (
      <span class={cls} style={{ '--avatar-color': color } as any} title={title || undefined}>
        {initials}
        <i class="avatar-photo" aria-hidden="true"></i>
      </span>
    )
  }
}
