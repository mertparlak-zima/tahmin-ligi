import { Link } from '@geajs/core'

export default function MainNav() {
  return (
    <nav class="mainnav" aria-label="Ana gezinme">
      <Link to="/" class="nav-item" exact>
        <span class="nav-icon">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5l3.5 2.6-1.3 4.2H9.8L8.5 10.1z" />
            <path d="M12 3v4.5M12 16.5V21M4.2 9.5l4.3 1M15.5 14.5l4.3 1M6.8 18.5l2.9-3.4M14.3 8.9l2.9-3.4" />
          </svg>
        </span>
        <span class="nav-label">Maçlar</span>
      </Link>
      <Link to="/puan-durumu" class="nav-item">
        <span class="nav-icon">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
            <path d="M7 6H4a1 1 0 0 0-1 1c0 2.2 1.8 4 4 4M17 6h3a1 1 0 0 1 1 1c0 2.2-1.8 4-4 4" />
          </svg>
        </span>
        <span class="nav-label">Puan</span>
      </Link>
      <Link to="/tahminlerim" class="nav-item">
        <span class="nav-icon">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </span>
        <span class="nav-label">Oyuncular</span>
      </Link>
      <Link to="/gecmis" class="nav-item">
        <span class="nav-icon">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l3.5 2" />
          </svg>
        </span>
        <span class="nav-label">Akış</span>
      </Link>
    </nav>
  )
}
