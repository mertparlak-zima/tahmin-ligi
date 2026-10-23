import { Component } from '@geajs/core'
import { Link } from '@geajs/core'

export default class NotFoundPage extends Component {
  template() {
    return (
      <div class="empty big">
        <div class="empty-title">Bu sayfa oyunda değil</div>
        <div class="empty-sub">Aradığın sayfa bulunamadı.</div>
        <Link to="/" class="btn ghost">Ana sayfaya dön</Link>
      </div>
    )
  }
}
