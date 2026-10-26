import { useEffect, useState } from 'react';
import { timeAgo } from '../../../lib/time';
import api from '../../../lib/api';
import { useDashboard } from '../DashboardStore';

/* Shared shell: backdrop click closes, same markup the original used. */
function ModalShell({ onClose, labelledBy, children }) {
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>
  );
}

/* ---------- Notification Center ----------
   Real rows from /dashboard/notifications, which already returns only what is
   addressed to you or broadcast to your role. Opening the panel marks them all
   read, which clears the bell's counter; the ones that were unread keep a
   "New" tag for as long as the panel stays open. */
export function NotificationCenter({ onClose }) {
  const { notifications, refresh } = useDashboard();
  const [fresh] = useState(() => new Set(notifications.filter((n) => !n.read).map((n) => n.id)));

  useEffect(() => {
    if (fresh.size === 0) return;
    api.dashboard.markAllRead().then(refresh).catch(() => {});
  }, [fresh, refresh]);

  return (
    <ModalShell onClose={onClose} labelledBy="notifTitle">
      <h3 id="notifTitle">Notification Center</h3>
      <div className="modal-row">
        <div className="push">
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="modal-list">
        {notifications.length === 0 ? (
          <div className="small muted">No notifications</div>
        ) : (
          notifications.map((n) => (
            <div className="notif-item" key={n.id}>
              <div className="row">
                <div>
                  <strong>{n.title}</strong>
                  {fresh.has(n.id) && <span className="notif-new">New</span>}
                  <div className="small muted">{n.body}</div>
                </div>
                <div className="small muted">{timeAgo(n.createdAt)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </ModalShell>
  );
}
