import { useNavigate, useSearchParams } from 'react-router-dom';
import { KEYS, removeRaw } from '../../../lib/storage';
import { setToken } from '../../../lib/api';
import { ROLES, ROLE_KEYS, normalizeRole, seesEverything } from '../../../lib/roleConfig';
import { useDashboard } from '../DashboardStore';

export default function Topbar({
  theme,
  onToggleTheme,
  onOpenMenu,
  onOpenNotifications,
  onOpenProfile,
  onOpenContactCore,
}) {
  const { role, currentUser, notifications, switchRole } = useDashboard();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const r = normalizeRole(role);
  const isDev = Boolean(params.get('dev'));

  /* Global search is a Founder/Core tool — partners only ever see their own
     records, so there is nothing for them to search across. */
  const showSearch = seesEverything(r);
  const isPartner = !seesEverything(r);
  const unread = notifications.filter((n) => !n.read && (n.role === r || n.role === 'all')).length;

  function logout() {
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
          <strong>{ROLES[r].label}</strong>
        </div>
        {showSearch && <input className="search" placeholder="Search listings, projects, clients..." />}
      </div>

      <div className="top-right">
        {isDev && (
          <select
            className="dev-role"
            title="Dev role switcher (dev only)"
            value={r}
            onChange={(e) => e.target.value && switchRole(e.target.value)}
          >
            {ROLE_KEYS.map((k) => (
              <option key={k} value={k}>
                {ROLES[k].label}
              </option>
            ))}
          </select>
        )}

        {isPartner && (
          <button className="btn-ghost" title="Contact Core Team" onClick={onOpenContactCore}>
            📞 <span className="btn-label">Contact Core</span>
          </button>
        )}

        <button className="btn-ghost" title="Toggle theme" onClick={onToggleTheme}>
          {theme === 'light' ? '☀️' : '🌙'}
        </button>

        {/* Notifications are a Founder/Core tool. Partners are told what they
            need to know through Contact Core and their own dashboard. */}
        {!isPartner && (
          <button className="btn-ghost" title="Notifications" onClick={onOpenNotifications}>
            🔔 {unread > 0 && <span className="badge">{unread}</span>}
          </button>
        )}

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
