// Takım armutu — koşulsuz katman tasarımı:
// img HER ZAMAN render edilir (opak zemin + z-index ile öndedir); logo yoksa
// veya yüklenemezse şeffaf 1px GIF'e düşer ve arkadaki baş harf görünür.
// (Not: props.crest'e bağlı JSX koşulları Gea derleyicisinde ertelenmiş
// değerlendirmede yanlış döndüğü için koşullu render'dan kaçınılır — bkv.
// docs/gea-upstream-bugs.md madde 10.)

import { Component } from '@geajs/core'

const TRANSPARENT_1PX =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

export default class Crest extends Component {
  declare props: { name: string; short: string; crest: string | null; size?: number }

  imgEl: HTMLImageElement | null = null

  onAfterRender() {
    if (this.imgEl) {
      this.imgEl.onerror = () => {
        this.imgEl.src = TRANSPARENT_1PX
      }
      if (this.imgEl.complete && this.imgEl.naturalWidth === 0 && !this.imgEl.src.endsWith('AQABAIAAAAAAAP')) {
        this.imgEl.onerror(null)
      }
    }
  }

  template({ name, short, crest, size = 28 }: any) {
    const initials = String(short ?? name ?? '?')
      .trim()
      .slice(0, 3)
      .toLocaleUpperCase('tr-TR')
    return (
      <span class="crest" data-size={String(size)}>
        <span class="crest-initials">{initials}</span>
        <img ref={this.imgEl} class="crest-img" src={crest || TRANSPARENT_1PX} alt={name} loading="lazy" />
      </span>
    )
  }
}
