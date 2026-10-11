import { useLocation, useNavigate } from 'react-router-dom';
import { KEYS, removeRaw } from '../../../lib/storage';
import api, { setToken } from '../../../lib/api';
import { ROLES, normalizeRole, seesEverything } from '../../../lib/roleConfig';
import { useDashboard } from '../DashboardStore';
import GlobalSearch from './GlobalSearch';

export default function Topbar({
  theme,
  onToggleTheme,
  onOpenMenu,
  onOpenNotifications,
  onOpenProfile,
}) {
  const { role, currentUser, notifications } = useDashboard();
  const navigate = useNavigate();
  const location = useLocation();

  const r = normalizeRole(role);
  /* Partner dashboards open with their own "Welcome back, <name>" header, so
     the top bar does not say it a second time there. */
  const greetHere = seesEverything(r) || location.pathname !== '/dashboard';

  /* Global search is a Founder/Core tool — partners only ever see their own
     records, so there is nothing for them to search across. */
  const showSearch = seesEverything(r);
  const unread = notifications.filter((n) => !n.read).length;

  async function logout() {
    /* Sign off first, while the token is still valid — otherwise the account
       keeps reading as online until the presence window lapses. */
    await api.auth.goOffline();
    setToken(null);
    removeRaw(KEYS.auth);
    removeRaw(KEYS.role);
    removeRaw(KEYS.userId);
    navigate('/login', { replace: true });
  }

  return (
    <header className="topbar" role="banner">
      {/* Opens the sidebar as an off-canvas drawer below the desktop
          breakpoint; dashboard.css hides this button above it, where the
          sidebar is always visible and there is nothing to open. */}
      <button className="menu-btn btn-ghost" title="Menu" aria-label="Open menu" onClick={onOpenMenu}>
        ☰
      </button>

      <div className="top-left">
        {/* The greeting is the first thing to go when space is tight — the
            role itself is the part worth keeping. */}
        <div className="welcome">
          {greetHere && <span className="welcome-prefix">Welcome back, </span>}
          <strong>{ROLES[r]?.label || ''}</strong>
        </div>
        {showSearch && <GlobalSearch />}
      </div>

      <div className="top-right">
        <button className="btn-ghost" title="Toggle theme" onClick={onToggleTheme}>
          {theme === 'light' ? '☀️' : '🌙'}
        </button>

        <button className="btn-ghost" title="Notifications" onClick={onOpenNotifications}>
          🔔 {unread > 0 && <span className="badge">{unread}</span>}
        </button>

        <div className="profile-mini" title="Profile (click)" onClick={onOpenProfile}>
          <div className="avatar" aria-hidden="true" />
          <div className="mini-name">{currentUser ? currentUser.name : 'You'}</div>
        </div>

        <button className="btn-ghost logout-btn" title="Logout" aria-label="Logout" onClick={logout}>
          <span className="btn-label">Logout</span>
          {/* Drawn, not a ⏻ character: many Android fonts have no glyph for
              it and showed an empty box. */}
          <svg className="btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </header>
  );
}
