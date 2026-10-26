import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { setToken } from '../lib/api';
import { KEYS, removeRaw } from '../lib/storage';
import { ROLES } from '../lib/roleConfig';
import { useDashboard } from './dashboard/DashboardStore';
import { usePortalTheme } from './dashboard/PortalLayout';
import { Section } from './dashboard/partner/shared';
import './dashboard/partner/partner.css';

/* Settings: account, password, appearance, notifications, session. */

function PasswordSection() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setError('');
    setDone('');
    if (form.next.length < 8) return setError('The new password must be at least 8 characters');
    if (form.next !== form.confirm) return setError('The two new passwords do not match');
    setBusy(true);
    try {
      await api.auth.changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      setDone('Password changed. Use the new one next time you sign in.');
    } catch (err) {
      setError(err.message || 'Could not change your password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="🔒 Password" subtitle="At least 8 characters. Do not reuse a password from another site.">
      <form onSubmit={save} autoComplete="off">
        <div className="qt-form">
          <label>
            <span>Current password</span>
            <input type="password" autoComplete="current-password" value={form.current} onChange={set('current')} />
          </label>
          <label>
            <span>New password</span>
            <input type="password" autoComplete="new-password" value={form.next} onChange={set('next')} />
          </label>
          <label>
            <span>Confirm new password</span>
            <input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
          </label>
        </div>
        <div className="pk-actions">
          <button className="btn" type="submit" disabled={busy || !form.current || !form.next}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
          {done && <span className="pk-saved">{done}</span>}
        </div>
        {error && <div className="pd-error">{error}</div>}
      </form>
    </Section>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { currentUser, role, notifications, refresh } = useDashboard();
  const themeCtx = usePortalTheme();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const unread = notifications.filter((n) => !n.read).length;

  async function markAllRead() {
    setBusy(true);
    try {
      await api.dashboard.markAllRead();
      await refresh();
      setNote('All notifications marked as read');
      setTimeout(() => setNote(''), 2500);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await api.auth.goOffline();
    setToken(null);
    removeRaw(KEYS.auth);
    removeRaw(KEYS.role);
    removeRaw(KEYS.userId);
    navigate('/login', { replace: true });
  }

  return (
    <div className="pd">
      <header className="pd-hero">
        <h1>Settings</h1>
        <p>Your account, password and how the portal looks.</p>
      </header>

      <div className="pd-grid">
        <div className="pd-col">
          <Section title="👤 Account">
            <div className="pd-figures">
              <div className="pd-figure"><div className="pd-figure-label">Name</div><div>{currentUser?.name || '—'}</div></div>
              <div className="pd-figure"><div className="pd-figure-label">Username</div><div>{currentUser?.username || '—'}</div></div>
              <div className="pd-figure"><div className="pd-figure-label">Email</div><div className="st-wrap">{currentUser?.email || '—'}</div></div>
              <div className="pd-figure"><div className="pd-figure-label">Role</div><div>{ROLES[role]?.label || role}</div></div>
            </div>
            <div className="pk-actions">
              <button className="btn-ghost" onClick={() => navigate('/profile')}>Edit profile →</button>
              <span className="small muted">Your role and login are set by the Xspace team.</span>
            </div>
          </Section>

          <PasswordSection />
        </div>

        <aside className="pd-col">
          <Section title="🎨 Appearance">
            <div className="pd-actions-row">
              {['dark', 'light'].map((t) => (
                <button
                  key={t}
                  className={themeCtx?.theme === t ? 'btn' : 'btn-ghost'}
                  onClick={() => themeCtx?.setTheme(t)}
                >
                  {t === 'dark' ? '🌙 Dark' : '☀️ Light'}
                </button>
              ))}
            </div>
            <div className="pd-note">Saved on this device.</div>
          </Section>

          <Section title="🔔 Notifications">
            <div className="pd-note">
              {unread ? <><strong>{unread}</strong> unread</> : 'You are all caught up.'}
            </div>
            <div className="pk-actions">
              <button className="btn-ghost" disabled={busy || !unread} onClick={markAllRead}>Mark all as read</button>
              {note && <span className="pk-saved">{note}</span>}
            </div>
          </Section>

          <Section title="🚪 Session">
            <div className="pd-note">Signing out ends this session on this device.</div>
            <div className="pk-actions">
              <button className="btn-ghost" onClick={signOut}>Sign out</button>
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}
