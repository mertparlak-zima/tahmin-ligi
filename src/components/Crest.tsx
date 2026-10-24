// Takım armutu — imperatif CSS background katmanı:
// Bu projede prop-zincirli src/koşul bağlantıları derleyicinin ertelenmiş
// değerlendirmesinde bozuluyor (bkv. docs/gea-upstream-bugs.md #9); <img>
// elementi tamamen kaldırıldı. Logo URL'i render anında prop'tan okunur ve
// onAfterRender'da background-image olarak atanır — reaktif binding yok,
// ezilme yok, event yarışı yok. Logo yoksa arkadaki baş harf kalır.
import { Component } from '@geajs/core'

export default class Crest extends Component {
  declare props: { name: string; short: string; crest: string | null; size?: number }

  crestUrl = ''

  onAfterRender() {
    if (!this.el) return
    const logo = this.el.querySelector('.crest-logo')
    if (!logo) return
    const url = this.crestUrl
    if (url && url !== 'null') {
      logo.style.backgroundImage = `url("${url}")`
    }
  }

  template({ name, short, crest, size = 28 }: any) {
    // Prop'u gövde ANINDA oku — kanıtlanmış güvenilir (bkv. upstream #9).
    this.crestUrl = String(crest ?? '')
    const initials = String(short ?? name ?? '?')
      .trim()
      .slice(0, 3)
      .toLocaleUpperCase('tr-TR')
    return (
      <span class="crest" data-size={String(size)} title={name}>
        <span class="crest-initials">{initials}</span>
        <i class="crest-logo" aria-hidden="true"></i>
      </span>
    )
  }
}
