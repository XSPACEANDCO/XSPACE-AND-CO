import { useNavigate } from 'react-router-dom';
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

  const r = normalizeRole(role);

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
          <span className="welcome-prefix">Welcome back, </span>
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

        <button className="btn-ghost" title="Logout" onClick={logout}>
          <span className="btn-label">Logout</span>
          <span className="btn-icon" aria-hidden="true">⏻</span>
        </button>
      </div>
    </header>
  );
}
