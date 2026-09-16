import { useState } from 'react';
import { usePageClass } from '../../hooks/usePageClass';
import { useTheme } from '../../hooks/useTheme';
import { DashboardProvider } from './DashboardStore';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import { NotificationCenter, ProfileModal } from './components/Modals';
import './dashboard.css';

/* The shell every in-portal page shares: role-filtered sidebar, top bar and
   the four global modals. The seven pages ported verbatim from the original
   HTML deliberately stay outside this — they were authored as standalone
   documents and keep that look. Wrap one in <PortalLayout> to give it the
   nav chrome. */
function Shell({ children }) {
  usePageClass('dashboard');
  const [theme, toggleTheme] = useTheme('dark');
  const [modal, setModal] = useState(null);
  const close = () => setModal(null);

  /* Below the desktop breakpoint the sidebar becomes an off-canvas drawer
     (see dashboard.css) instead of a permanent column — this state is what
     opens and closes it. Harmless above the breakpoint, where CSS ignores
     the "open" class and the sidebar is always visible. */
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className={'page-dashboard' + (navOpen ? ' nav-open' : '')}>
      <Sidebar onNavigate={() => setNavOpen(false)} />
      {navOpen && (
        <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />
      )}

      <div className="main">
        <Topbar
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenMenu={() => setNavOpen((v) => !v)}
          onOpenNotifications={() => setModal('notifications')}
          onOpenProfile={() => setModal('profile')}
        />
        <main className="workspace">{children}</main>
      </div>

      {modal === 'notifications' && <NotificationCenter onClose={close} />}
      {modal === 'profile' && <ProfileModal onClose={close} />}
    </div>
  );
}

export default function PortalLayout({ children }) {
  return (
    <DashboardProvider>
      <Shell>{children}</Shell>
    </DashboardProvider>
  );
}
