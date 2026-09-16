import { useLocation, useNavigate } from 'react-router-dom';
import { ROLES, modulesForRole, normalizeRole } from '../../../lib/roleConfig';
import { useDashboard } from '../DashboardStore';

export default function Sidebar() {
  const { role } = useDashboard();
  const navigate = useNavigate();
  const location = useLocation();

  const r = normalizeRole(role);
  const modules = modulesForRole(r);

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
            onClick={() => navigate(m.to)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="footer small">© Xspace &amp; Co.</div>
    </nav>
  );
}
