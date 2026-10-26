import { useEffect, useRef, useState } from 'react';
import { timeAgo } from '../../../lib/time';
import { ROLES } from '../../../lib/roleConfig';
import api from '../../../lib/api';
import { useDashboard } from '../DashboardStore';

/* Centre-crops an image file to a size×size JPEG data URL. */
function squareJpeg(file, size) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(
        img,
        (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
        0, 0, size, size
      );
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} could not be read as an image`));
    };
    img.src = url;
  });
}

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
   addressed to you or broadcast to your role. Marking one read persists. */
export function NotificationCenter({ onClose }) {
  const { notifications, refresh } = useDashboard();
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);

  const items = notifications.filter((n) => (filter === 'unread' ? !n.read : true));

  async function markRead(id) {
    setBusy(true);
    try {
      await api.dashboard.markRead(id);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell onClose={onClose} labelledBy="notifTitle">
      <h3 id="notifTitle">Notification Center</h3>
      <div className="modal-row">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="unread">Unread</option>
        </select>
        <div className="push">
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="modal-list">
        {items.length === 0 ? (
          <div className="small muted">No notifications</div>
        ) : (
          items.map((n) => (
            <div className="notif-item" key={n.id}>
              <div className="row">
                <div>
                  <strong>{n.title}</strong>
                  <div className="small muted">{n.body}</div>
                </div>
                <div className="small muted">{timeAgo(n.createdAt)}</div>
              </div>
              {!n.read && (
                <div style={{ marginTop: 8 }}>
                  <button className="btn-ghost" disabled={busy} onClick={() => markRead(n.id)}>
                    Mark read
                  </button>
                </div>
              )}
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
            style={currentUser?.avatar_url ? { backgroundImage: `url(${currentUser.avatar_url})` } : undefined}
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
