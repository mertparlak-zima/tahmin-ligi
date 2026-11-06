import { createRouter } from '@geajs/core'
import MatchesPage from './pages/MatchesPage'
import StandingsPage from './pages/StandingsPage'
import MyPredictionsPage from './pages/MyPredictionsPage'
import ResultsPage from './pages/ResultsPage'
import MahoPage from './pages/MahoPage'
import NotFoundPage from './pages/NotFoundPage'

export const router = createRouter({
  '/': MatchesPage,
  '/puan-durumu': StandingsPage,
  '/tahminlerim': MyPredictionsPage,
  '/gecmis': ResultsPage,
  // Gizli sohbet sayfası — UI'da linklenmez (yalnız URL ile erişim).
  '/maho': MahoPage,
  '*': NotFoundPage,
} as const)
