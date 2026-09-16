import { useLocation, useNavigate } from 'react-router-dom';
import { ROLES, modulesForRole, normalizeRole } from '../../../lib/roleConfig';
import { useDashboard } from '../DashboardStore';

/* onNavigate: called after picking a destination, so the mobile drawer
   closes itself instead of staying open over the page it just opened. A
   no-op on desktop, where the sidebar is a permanent column anyway. */
export default function Sidebar({ onNavigate }) {
  const { role } = useDashboard();
  const navigate = useNavigate();
  const location = useLocation();

  const r = normalizeRole(role);
  const modules = modulesForRole(r);

  function go(to) {
    navigate(to);
    onNavigate?.();
  }

  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div>
        <div className="brand">Xspace &amp; Co.</div>
        <div className="role-badge">Role: {ROLES[r].label}</div>
        <div className="role-badge">Login: {ROLES[r].login}</div>
      </div>

      <div className="nav-list">
        {modules.map((m) => (
          <button
            key={m.key}
            type="button"
            className={'nav-item' + (location.pathname === m.to ? ' active' : '')}
            onClick={() => go(m.to)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="footer small">© Xspace &amp; Co.</div>
    </nav>
  );
}
