import { createRouter } from '@geajs/core'
import MatchesPage from './pages/MatchesPage'
import StandingsPage from './pages/StandingsPage'
import MyPredictionsPage from './pages/MyPredictionsPage'
import ResultsPage from './pages/ResultsPage'
import NotFoundPage from './pages/NotFoundPage'

export const router = createRouter({
  '/': MatchesPage,
  '/puan-durumu': StandingsPage,
  '/tahminlerim': MyPredictionsPage,
  '/gecmis': ResultsPage,
  '/admin': () => import('./pages/AdminPage'),
  '*': NotFoundPage,
} as const)
