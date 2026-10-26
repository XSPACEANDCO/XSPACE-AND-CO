import { useEffect, useRef, useState } from 'react';
import { timeAgo } from '../../../lib/time';
import { ROLES } from '../../../lib/roleConfig';
import { squareJpeg } from '../../../lib/image';
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

/* ---------- Profile ----------
   Name and photo are yours to change. Role is not: letting someone edit their
   own role here would hand every partner a Founder account, which is the whole
   point of the access model. It is shown as text, and the server would refuse
   the change anyway — only a Founder can call PATCH /users/:id with a role. */
export function ProfileModal({ onClose }) {
  const { currentUser, refresh } = useDashboard();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [photoNote, setPhotoNote] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (currentUser) setName(currentUser.name || '');
  }, [currentUser]);

  async function save() {
    setError('');
    if (!name.trim()) return setError('Name cannot be empty');
    setBusy(true);
    try {
      await api.users.updateProfile({ name: name.trim() });
      await refresh();
      onClose();
    } catch (err) {
      setError(err.message || 'Could not save your profile');
    } finally {
      setBusy(false);
    }
  }

  /* Opens the device gallery / file picker, then uploads and saves straight
     away. The photo is shrunk to a small square JPEG first: it is only ever
     shown as a circle, and a raw phone photo would be megabytes in the
     database for a 36px avatar. */
  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) return setError('Choose an image file');
    setPhotoNote('Uploading photo…');
    try {
      const dataUrl = await squareJpeg(file, 256);
      const out = await api.files.upload(dataUrl, 'avatar.jpg');
      await api.users.updateProfile({ avatar_url: out.url });
      await refresh();
      setPhotoNote('Photo updated.');
    } catch (err) {
      setPhotoNote('');
      setError(err.message || 'Could not upload the photo');
    }
  }

  const role = currentUser?.role;

  return (
    <ModalShell onClose={onClose} labelledBy="profileTitle">
      <h3 id="profileTitle">Profile</h3>
      <div className="profile-body">
        <div className="profile-side">
          <div
            className="profile-avatar-large"
            style={currentUser?.avatarUrl ? { backgroundImage: `url(${currentUser.avatarUrl})` } : undefined}
          />
          <div style={{ marginTop: 8 }}>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
              Upload
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={onPick}
            />
          </div>
        </div>

        <div className="profile-fields">
          <label className="small">Full name</label>
          <br />
          <input className="full" value={name} onChange={(e) => setName(e.target.value)} />

          <div className="profile-row">
            <div className="profile-field-grow">
              <label className="small">Email</label>
              <br />
              <input className="full" value={currentUser?.email || ''} readOnly />
            </div>
            <div className="profile-field-role">
              <label className="small">Role</label>
              <br />
              <div className="profile-role-fixed">{role ? ROLES[role]?.label || role : '—'}</div>
            </div>
          </div>

          {photoNote && <div className="small muted" style={{ marginTop: 8 }}>{photoNote}</div>}
          {error && <div className="people-error" style={{ marginTop: 8 }}>{error}</div>}

          <div className="presence-row">
            <div className="push">
              <button className="btn" disabled={busy} onClick={save}>
                {busy ? 'Saving…' : 'Save'}
              </button>{' '}
              <button className="btn-ghost" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
