import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { squareJpeg } from '../lib/image';
import { ROLES, seesEverything } from '../lib/roleConfig';
import { useLogout } from '../hooks/useLogout';
import { useDashboard } from './dashboard/DashboardStore';
import { usePortalTheme } from './dashboard/PortalLayout';
import { Section } from './dashboard/partner/shared';
import { ProfileSection } from './ProfileKyc';
import './dashboard/partner/partner.css';
import './profile.css';

/* My profile — every role, opened by tapping your photo in the top bar.

   Photo, your own details, theme, and signing out all live here, so the top
   bar can stay small on a phone. Partners' identity documents and payout
   account stay on Profile & KYC, which this links to. */
export default function Profile() {
  const { role, currentUser, refresh } = useDashboard();
  const themeCtx = usePortalTheme();
  const logout = useLogout();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [photoMsg, setPhotoMsg] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    if (!file.type.startsWith('image/')) return setPhotoError('Choose an image file');
    setPhotoMsg('Uploading photo…');
    try {
      const dataUrl = await squareJpeg(file, 256);
      const out = await api.files.upload(dataUrl, 'avatar.jpg');
      await api.users.updateProfile({ avatar_url: out.url });
      await refresh();
      setPhotoMsg('Photo updated');
      setTimeout(() => setPhotoMsg(''), 2500);
    } catch (err) {
      setPhotoMsg('');
      setPhotoError(err.message || 'Could not upload the photo');
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  }

  const avatar = currentUser?.avatarUrl;

  return (
    <div className="pd">
      <header className="pd-hero pf-hero">
        <button
          type="button"
          className="pf-avatar"
          style={avatar ? { backgroundImage: `url(${avatar})` } : undefined}
          onClick={() => fileRef.current?.click()}
          aria-label="Change profile photo"
        >
          {!avatar && (currentUser?.name || '?').trim().charAt(0).toUpperCase()}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={onPick} />
        <div className="pf-id">
          <h1>{currentUser?.name || 'My profile'}</h1>
          <p>{ROLES[role]?.label || role}{currentUser?.email ? ` · ${currentUser.email}` : ''}</p>
          <button type="button" className="btn-ghost pf-photo-btn" onClick={() => fileRef.current?.click()}>
            {avatar ? 'Change photo' : 'Add photo'}
          </button>
          {photoMsg && <span className="pk-saved">{photoMsg}</span>}
          {photoError && <div className="pd-error">{photoError}</div>}
        </div>
      </header>

      <div className="pd-grid pk-grid">
        <div className="pd-col">
          <ProfileSection me={currentUser} role={role} refresh={refresh} />
          {!seesEverything(role) && (
            <Section title="🪪 KYC & payouts" subtitle="Identity documents and where your commission is paid">
              <button className="btn-ghost" onClick={() => navigate('/profile-kyc')}>Open Profile &amp; KYC →</button>
            </Section>
          )}
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
                  {t === 'dark' ? '🌙 Night' : '☀️ Day'}
                </button>
              ))}
            </div>
            <div className="pd-note">Saved on this device.</div>
          </Section>

          <Section title="🔐 Account" subtitle="Password and notification settings are in Settings">
            <div className="pd-actions-row">
              <button className="btn-ghost" onClick={() => navigate('/settings')}>Settings →</button>
              <button className="btn pf-logout" disabled={signingOut} onClick={signOut}>
                {signingOut ? 'Signing out…' : 'Log out'}
              </button>
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}
