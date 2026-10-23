import { Component, RouterView, Link } from '@geajs/core'
import { router } from './router'
import leagueStore from './stores/league-store'
import uiStore from './stores/ui-store'
import TopBar from './components/TopBar'
import MainNav from './components/MainNav'
import MatchSheet from './components/MatchSheet'
import IdentityModal from './components/IdentityModal'
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
  }

  template() {
    return (
      <div class="app">
        <TopBar />
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
    )
  }
}
