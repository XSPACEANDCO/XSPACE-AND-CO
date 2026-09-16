import { useState } from 'react';
import { usePageClass } from '../../hooks/usePageClass';
import { useTheme } from '../../hooks/useTheme';
import { DashboardProvider } from './DashboardStore';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import { ContactCoreModal, NotificationCenter, ProfileModal, TicketModal } from './components/Modals';
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

  return (
    <div className="page-dashboard">
      <Sidebar />

      <div className="main">
        <Topbar
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenNotifications={() => setModal('notifications')}
          onOpenProfile={() => setModal('profile')}
          onOpenContactCore={() => setModal('contactCore')}
        />
        <main className="workspace">{children}</main>
      </div>

      {modal === 'notifications' && (
        <NotificationCenter onClose={close} onRaiseTicket={() => setModal('ticket')} />
      )}
      {modal === 'ticket' && <TicketModal onClose={close} />}
      {modal === 'contactCore' && <ContactCoreModal onClose={close} />}
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
