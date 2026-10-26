import { useNavigate } from 'react-router-dom';
import { normalizeRole, seesEverything } from '../../../lib/roleConfig';
import { useDashboard } from '../DashboardStore';
import GlobalSearch from './GlobalSearch';

export default function Topbar({ onOpenMenu, onOpenNotifications }) {
  const { role, currentUser, notifications } = useDashboard();
  const navigate = useNavigate();

  const r = normalizeRole(role);

  /* Global search is a Founder/Core tool — partners only ever see their own
     records, so there is nothing for them to search across. */
  const showSearch = seesEverything(r);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <header className="topbar" role="banner">
      {/* Opens the sidebar as an off-canvas drawer below the desktop
          breakpoint; dashboard.css hides this button above it, where the
          sidebar is always visible and there is nothing to open. */}
      <button className="menu-btn btn-ghost" title="Menu" aria-label="Open menu" onClick={onOpenMenu}>
        ☰
      </button>

      <div className="top-left">
        {/* Same mark as the website's header (xspacelandingpage Icon.jsx). */}
        <button type="button" className="top-brand" onClick={() => navigate('/dashboard')} aria-label="Xspace & Co. home">
          <span className="top-brand-mark">
            <svg viewBox="280 340 470 345" aria-hidden="true">
              <polygon fill="currentColor" points="290,353 418,353 717,670 600,670" />
              <polygon fill="currentColor" points="455,520 478,542 343,670 296,670" />
              <polygon fill="currentColor" points="528,435 606,353 732,353 584,492" />
            </svg>
          </span>
          <span className="top-brand-name">Xspace &amp; Co.</span>
        </button>
        {showSearch && <GlobalSearch />}
      </div>

      <div className="top-right">
        <button className="btn-ghost" title="Notifications" onClick={onOpenNotifications}>
          🔔 {unread > 0 && <span className="badge">{unread}</span>}
        </button>

        {/* Theme and logout live on the profile page this opens. */}
        <div className="profile-mini" title="My profile" onClick={() => navigate('/profile')}>
          <div
            className="avatar"
            aria-hidden="true"
            style={currentUser?.avatarUrl ? { backgroundImage: `url(${currentUser.avatarUrl})` } : undefined}
          />
          <div className="mini-name">{currentUser ? currentUser.name : 'You'}</div>
        </div>
      </div>
    </header>
  );
}
