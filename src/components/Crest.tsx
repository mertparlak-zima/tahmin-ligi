// Takım armutu: img yüklenemezse baş harf daireye düşer.

import { Component } from '@geajs/core'
import { cn } from '../utils/cn'

export default class Crest extends Component {
  declare props: { name: string; short: string; crest: string | null; size?: number }

  failed = false
  imgEl: HTMLImageElement | null = null

  onAfterRender() {
    if (this.imgEl) {
      this.imgEl.onload = () => (this.failed = false)
      this.imgEl.onerror = () => (this.failed = true)
      if (this.imgEl.complete && this.imgEl.naturalWidth === 0) this.failed = true
    }
  }

  template({ name, short, crest, size = 28 }: any) {
    const initials = String(short ?? name ?? '?')
      .trim()
      .slice(0, 3)
      .toLocaleUpperCase('tr-TR')
    return (
      <span class={cn('crest', this.failed && 'crest-fallback')} style={{ width: `${size}px`, height: `${size}px` }}>
        {!this.failed && crest ? (
          <img ref={this.imgEl} class="crest-img" src={crest} alt={name} loading="lazy" />
        ) : null}
        <span class="crest-initials">{initials}</span>
      </span>
    )
  }
}
