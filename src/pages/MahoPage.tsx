// /maho — UI'dan HİÇBİR YERDE linklenmeyen gizli sohbet sayfası (yalnız URL
// bilenler girer; erişim yine Vercel Deployment Protection arkasındadır).
// Bir metin kutusu + gönder düğmesi: yazılan ÖN EKSİZ Discord'a düşer.
// Nav/footer'da girişi yoktur; router kaydı dışında iz bırakmaz.
//
// Gea kısıtlarına uyum: rota hedefi CLASS component (kural 3), tek kök +
// kökte ternary yok (kural 12), keyed map öğesi component (kural 6), liste
// DOĞRUDAN store erişimiyle map'lenir (kural 7), yanında named export yok
// (kural 2 — yardımcı class local).

import { Component } from '@geajs/core'
import mahoStore from '../stores/maho-store'

/** Oturum listesi öğesi (keyed map öğesi ham element olamaz — kural 6). */
class MahoSentItem extends Component {
  template({ item }: any) {
    return (
      <div class="maho-msg">
        <span class="maho-msg-head">
          <span class="maho-msg-name">{item.name !== '' ? item.name : '·'}</span>
          <span class="maho-msg-at">{item.at}</span>
        </span>
        <span class="maho-msg-text">{item.text}</span>
      </div>
    )
  }
}

export default class MahoPage extends Component {
  template() {
    return (
      <div class="maho-page">
        <div class="maho-head">
          <h1 class="maho-title">maho</h1>
          <p class="maho-sub">Yazdığın anında Discord'a düşer. İsim boşsa webhook adıyla gider.</p>
        </div>

        <div class="maho-composer">
          <input
            class="input maho-name"
            type="text"
            placeholder="İsim (opsiyonel)"
            maxlength="80"
            aria-label="Görünen ad (opsiyonel)"
            value={mahoStore.name}
            input={e => mahoStore.setName((e.target as HTMLInputElement).value)}
          />
          <textarea
            class="input maho-text"
            rows="3"
            placeholder="Mesajını yaz…"
            aria-label="Mesaj"
            value={mahoStore.text}
            input={e => mahoStore.setText((e.target as HTMLTextAreaElement).value)}
            keydown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                mahoStore.send()
              }
            }}
          ></textarea>
          <div class="maho-actions">
            <span class={mahoStore.text.length >= 2000 ? 'maho-count max' : 'maho-count'}>
              {mahoStore.text.length}/2000
            </span>
            <button
              class="btn primary"
              disabled={!mahoStore.canSend}
              click={() => mahoStore.send()}
            >
              {mahoStore.sending ? 'Gönderiliyor…' : 'Gönder'}
            </button>
          </div>
        </div>

        <div class={mahoStore.sent.length > 0 ? 'maho-sent has' : 'maho-sent'}>
          <div class="maho-sent-title">Bu oturumda gönderdiklerin</div>
          {mahoStore.sent.map(item => (
            <MahoSentItem key={item.id} item={item} />
          ))}
        </div>
      </div>
    )
  }
}
