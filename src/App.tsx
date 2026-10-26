import { Component, RouterView } from '@geajs/core'
import { router } from './router'
import leagueStore from './stores/league-store'
import uiStore from './stores/ui-store'
import TopBar from './components/TopBar'
import MainNav from './components/MainNav'
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
        uiStore.closeMatchAccordion()
      }
    })
    // #21 Faz 2: lig teması body sınıfı — ilk değer (localStorage'dan gelen
    // lig) elle uygulanır, observe değişimde (switchLeague) sınıfları tazeler.
    // CSS değişkenleri + zemin logosu body.league-eu / body.league-tsl
    // bloklarından gelir. (#24 Faz 2: admin-mode body sınıfı ve adminStore
    // bağlantısı yönetim paneliyle birlikte kaldırıldı.)
    const applyLeagueTheme = () => {
      document.body.classList.remove('league-eu', 'league-tsl')
      document.body.classList.add(leagueStore.league === 'TSL' ? 'league-tsl' : 'league-eu')
    }
    applyLeagueTheme()
    leagueStore.observe('league', applyLeagueTheme)
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
          </footer>
          <Toasts />
        </div>
        <DatePreviewPopover />
      </div>
    )
  }
}
