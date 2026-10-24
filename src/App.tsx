import { Component, RouterView, Link } from '@geajs/core'
import { router } from './router'
import leagueStore from './stores/league-store'
import uiStore from './stores/ui-store'
import adminStore from './stores/admin-store'
import TopBar from './components/TopBar'
import MainNav from './components/MainNav'
import MatchSheet from './components/MatchSheet'
import IdentityModal from './components/IdentityModal'
import DatePreviewPopover from './components/DatePreviewPopover'
import Toasts from './components/Toasts'

export default class App extends Component {
  created() {
    leagueStore.load()
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') leagueStore.onVisibilityGained()
    })
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        uiStore.closeSheet()
        uiStore.closeIdentityModal()
      }
    })
    // Admin modu görsel uyarısı (#20 U3): body sınıfı authed ile senkron.
    // observe yalnız değişimde tetiklenir → ilk değer (sessionStorage'dan
    // gelen authed) elle uygulanır; 401→logout yolu sınıfı düşürür.
    const applyAdminMode = () => {
      document.body.classList.toggle('admin-mode', adminStore.authed)
    }
    applyAdminMode()
    adminStore.observe('authed', applyAdminMode)
  }

  template() {
    return (
      <div class="app-root">
        <TopBar />
        <div class="app">
          <MainNav />
          <main class="page">
            <RouterView router={router} />
          </main>
          <footer class="footer">
            <span>{leagueStore.data?.meta?.leagueName ?? 'Tahmin Ligi'} · arkadaşlar arası tahmin ligi</span>
            <span class="footer-right">Veri: ESPN</span>
            <Link to="/admin" class="footer-admin">Yönetim</Link>
          </footer>
          <MatchSheet />
          <IdentityModal />
          <Toasts />
        </div>
        <DatePreviewPopover />
      </div>
    )
  }
}
