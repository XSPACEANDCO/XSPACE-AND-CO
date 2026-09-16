import { useCallback, useEffect, useMemo, useState } from 'react';
import PortalLayout from './dashboard/PortalLayout';
import api from '../lib/api';
import { ROLES, creatableRoles, roleLabel } from '../lib/roleConfig';
import './teams.css';

/* Every account in the portal, on one screen.

   Four rosters behind one set of tabs — the core team and the three partner
   kinds — because they are the same job: see who exists, create an account,
   hand over the credentials, reset them, switch someone off.

   Passwords are bcrypt hashes and cannot be read back, so a card shows one
   only in the moment it is issued. Losing it costs a reset, not an account.

   Nothing here decides permissions. It hides what the signed-in role cannot
   do, but every button calls an endpoint that checks the same rule again;
   hiding is courtesy, not security. */

const GROUPS = [
  { key: 'core', stat: 'Core Team', label: 'Core Team', sub: 'CRM & operations', tone: 'blue', role: 'core' },
  { key: 'realtor', stat: 'Realtors', label: 'Realtors', sub: 'Sales network', tone: 'orange', role: 'realtor' },
  { key: 'creator', stat: 'Creators', label: 'Creators', sub: 'Lead generation', tone: 'pink', role: 'creator' },
  { key: 'studio', stat: 'Studio Team', label: 'Studio', sub: 'Media production', tone: 'purple', role: 'studio' },
];

/* What the create form asks for on top of the common fields. */
const ROLE_FIELDS = {
  realtor: [{ key: 'areas', label: 'Areas covered', placeholder: 'Tellapur, Nallagandla' }],
  creator: [
    { key: 'platform', label: 'Platform', placeholder: 'Instagram' },
    { key: 'handle', label: 'Handle', placeholder: '@name' },
  ],
  studio: [{ key: 'skill', label: 'Skill', placeholder: 'Edit / VR' }],
};

const EMPTY = {
  name: '', username: '', email: '', phone: '', role: '', password: '',
  areas: '', platform: '', handle: '', skill: '',
};

/* A deactivated account is off regardless of who is at their desk, so the flag
   wins over the presence field. */
function statusOf(u) {
  if (!u.active) return { label: 'Deactivated', tone: 'off' };
  const p = (u.presence || 'online').toLowerCase();
  if (p === 'away') return { label: 'Away', tone: 'away' };
  if (p === 'offline') return { label: 'Offline', tone: 'idle' };
  return { label: 'Online', tone: 'on' };
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className="tstat">
      <div className="tstat-label">{label}</div>
      <div className={'tstat-value' + (tone ? ' is-' + tone : '')}>{value}</div>
      <div className="tstat-sub">{sub}</div>
    </div>
  );
}

export default function Teams() {
  const [me, setMe] = useState(null);
  const [groups, setGroups] = useState({ core: [], realtor: [], creator: [], studio: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [banner, setBanner] = useState('');

  /* userId -> the password just issued for them. Held in memory only: it is
     never stored in readable form, here or on the server. */
  const [revealed, setRevealed] = useState({});
  const [copied, setCopied] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [core, realtor, creator, studio] = await Promise.all([
        api.users.team().then((r) => r.team),
        api.users.realtors({ limit: 100 }).then((r) => r.partners),
        api.users.creators({ limit: 100 }).then((r) => r.partners),
        api.users.studios({ limit: 100 }).then((r) => r.partners),
      ]);
      setGroups({ core, realtor, creator, studio });
    } catch (err) {
      setError(err.message || 'Could not load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.auth.me().then((r) => setMe(r.user)).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const creatable = useMemo(() => creatableRoles(me?.role), [me]);
  const isFounder = me?.role === 'founder';

  const everyone = useMemo(
    () => [...groups.core, ...groups.realtor, ...groups.creator, ...groups.studio],
    [groups]
  );

  const visible = useMemo(() => {
    const rows = tab === 'all' ? everyone : groups[tab] || [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q)
    );
  }, [everyone, groups, tab, search]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function openModal() {
    const tabRole = GROUPS.find((g) => g.key === tab)?.role;
    setForm({
      ...EMPTY,
      role: creatable.includes(tabRole) ? tabRole : creatable[0] || '',
    });
    setFormError('');
    setModalOpen(true);
  }

  async function createAccount(e) {
    e.preventDefault();
    setFormError('');
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        username: form.username.trim().toLowerCase(),
        email: form.email.trim(),
        role: form.role,
      };
      if (form.phone.trim()) payload.phone = form.phone.trim();
      if (form.password) payload.password = form.password;
      for (const f of ROLE_FIELDS[form.role] || []) {
        if (form[f.key].trim()) payload[f.key] = form[f.key].trim();
      }

      const out = await api.users.create(payload);
      setRevealed((r) => ({ ...r, [out.user.id]: out.password }));
      setBanner(`${out.user.name} created — their password is on their card below.`);
      setModalOpen(false);
      setForm(EMPTY);
      setTab(out.user.role === 'founder' ? 'core' : out.user.role);
      await refresh();
    } catch (err) {
      setFormError(err.message || 'Could not create the account');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(user) {
    if (!window.confirm(`Issue a new password for ${user.name}? Their current one stops working.`))
      return;
    try {
      const out = await api.users.resetPassword(user.id);
      setRevealed((r) => ({ ...r, [user.id]: out.password }));
      setBanner(`New password issued for ${user.name}.`);
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not reset that password');
    }
  }

  async function setActive(user, active) {
    try {
      await api.users.update(user.id, { active });
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not update that account');
    }
  }

  function hide(userId) {
    setRevealed(({ [userId]: _gone, ...rest }) => rest);
  }

  function copyLogin(u) {
    const text = `Xspace & Co. Portal\nUsername: ${u.username}\nPassword: ${revealed[u.id]}`;
    navigator.clipboard?.writeText(text).then(
      () => setCopied(u.id),
      () => setCopied('')
    );
  }

  const current = GROUPS.find((g) => g.key === tab);
  const canCreateHere = !current || creatable.includes(current.role);

  return (
    <PortalLayout>
      <div className="teams-page">
        <header className="teams-head">
          <div>
            <h1 className="teams-title">Teams</h1>
            <div className="teams-subtitle">Manage internal operations &amp; workforce</div>
          </div>
          {creatable.length > 0 && (
            <button className="teams-add" onClick={openModal}>
              + Add Member
            </button>
          )}
        </header>

        <div className="teams-stats">
          <Stat label="Total Members" value={everyone.length} sub="Entire workforce" />
          <Stat
            label="Active Members"
            value={everyone.filter((u) => u.active).length}
            sub="Currently operational"
            tone="green"
          />
          {GROUPS.map((g) => (
            <Stat
              key={g.key}
              label={g.stat}
              value={(groups[g.key] || []).length}
              sub={g.sub}
              tone={g.tone}
            />
          ))}
        </div>

        <div className="teams-toolbar">
          <div className="teams-tabs">
            <button
              className={'teams-tab' + (tab === 'all' ? ' is-active' : '')}
              onClick={() => setTab('all')}
            >
              All
            </button>
            {GROUPS.map((g) => (
              <button
                key={g.key}
                className={'teams-tab' + (tab === g.key ? ' is-active' : '')}
                onClick={() => setTab(g.key)}
              >
                {g.label}
              </button>
            ))}
          </div>
          <input
            className="teams-search"
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {error && <div className="teams-error">{error}</div>}

        {banner && (
          <div className="teams-banner">
            <span>{banner}</span>
            <button className="teams-link" onClick={() => setBanner('')}>
              Dismiss
            </button>
          </div>
        )}

        {me && !canCreateHere && (
          <div className="teams-note">
            {roleLabel(me.role)} accounts cannot create or reset {current.label.toLowerCase()}{' '}
            logins — only a Founder can.
          </div>
        )}

        {loading ? (
          <div className="teams-empty">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="teams-empty">
            {search ? 'Nobody matches that search.' : 'Nobody here yet.'}
          </div>
        ) : (
          <div className="teams-grid">
            {visible.map((u) => {
              const status = statusOf(u);
              /* A Core member never sees a Founder's login. The server leaves
                 the username out too — this only stops it being painted. */
              const redacted = me?.role === 'core' && u.role === 'founder';
              const mayManage = creatable.includes(u.role);
              const shown = revealed[u.id];

              return (
                <article key={u.id} className={'tcard' + (u.active ? '' : ' is-off')}>
                  <div className="tcard-top">
                    <div className="tcard-avatar">{u.name.trim().charAt(0).toUpperCase()}</div>
                    <div className="tcard-id">
                      <div className="tcard-name">{u.name}</div>
                      <div className="tcard-role">{roleLabel(u.role)}</div>
                    </div>
                    <div className={'tcard-status is-' + status.tone}>
                      <span className="tcard-dot" />
                      {status.label}
                    </div>
                  </div>

                  <dl className="tcard-fields">
                    <div>
                      <dt>Username</dt>
                      <dd className="tcard-mono">
                        {redacted ? <span className="tcard-hidden">Hidden</span> : u.username || '—'}
                      </dd>
                    </div>

                    <div>
                      <dt>Password</dt>
                      <dd>
                        {redacted ? (
                          <span className="tcard-hidden">Hidden</span>
                        ) : shown ? (
                          <span className="tcard-pwrow">
                            <code className="tcard-pw">{shown}</code>
                            <button className="teams-link" onClick={() => copyLogin(u)}>
                              {copied === u.id ? 'Copied' : 'Copy'}
                            </button>
                            <button className="teams-link" onClick={() => hide(u.id)}>
                              Hide
                            </button>
                          </span>
                        ) : (
                          <span className="tcard-pwrow">
                            <span className="tcard-hidden">••••••••</span>
                            {mayManage && (
                              <button className="teams-link" onClick={() => resetPassword(u)}>
                                Reset
                              </button>
                            )}
                          </span>
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt>Email</dt>
                      <dd>{u.email}</dd>
                    </div>

                    <div>
                      <dt>Phone</dt>
                      <dd>{u.phone || '—'}</dd>
                    </div>
                  </dl>

                  {isFounder && u.id !== me?.id && (
                    <div className="tcard-actions">
                      <button className="teams-link" onClick={() => setActive(u, !u.active)}>
                        {u.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          className="modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}
        >
          <div className="modal">
            <h3>Add Member</h3>
            <form onSubmit={createAccount} className="teams-form" autoComplete="off">
              <label>
                <span>Full name</span>
                <input value={form.name} onChange={set('name')} placeholder="Full name" required />
              </label>
              <label>
                <span>Username</span>
                <input
                  value={form.username}
                  onChange={set('username')}
                  placeholder="They sign in with this"
                  pattern="[A-Za-z0-9._\-]{3,32}"
                  title="3–32 characters: letters, digits, dot, dash or underscore"
                  required
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  placeholder="name@example.com"
                  required
                />
              </label>
              <label>
                <span>Phone</span>
                <input value={form.phone} onChange={set('phone')} placeholder="Optional" />
              </label>
              <label>
                <span>Role</span>
                <select value={form.role} onChange={set('role')}>
                  {creatable.map((r) => (
                    <option key={r} value={r}>
                      {ROLES[r].label}
                    </option>
                  ))}
                </select>
              </label>

              {(ROLE_FIELDS[form.role] || []).map((f) => (
                <label key={f.key}>
                  <span>{f.label}</span>
                  <input value={form[f.key]} onChange={set(f.key)} placeholder={f.placeholder} />
                </label>
              ))}

              <label className="teams-form-wide">
                <span>Password</span>
                <input
                  value={form.password}
                  onChange={set('password')}
                  placeholder="Leave blank to generate one (recommended)"
                  minLength={8}
                />
              </label>

              {formError && <div className="teams-error teams-form-wide">{formError}</div>}

              <div className="teams-form-wide teams-form-foot">
                <span className="teams-form-hint">
                  Shown once on their card. Only the hash is stored.
                </span>
                <div className="teams-form-actions">
                  <button type="button" className="teams-cancel" onClick={() => setModalOpen(false)}>
                    Cancel
                  </button>
                  <button className="teams-add" type="submit" disabled={busy}>
                    {busy ? 'Creating…' : 'Add'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
