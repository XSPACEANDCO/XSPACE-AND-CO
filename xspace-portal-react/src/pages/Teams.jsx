import { useCallback, useEffect, useMemo, useState } from 'react';
import { copyText } from '../lib/clipboard';
import PortalLayout from './dashboard/PortalLayout';
import api from '../lib/api';
import { ROLES, creatableRoles, roleLabel } from '../lib/roleConfig';
import EmailLog from './EmailLog';
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
  areas: '', platform: '', handle: '', skill: '', joinRequestId: '',
};

/* Website join requests (server/src/routes/enquiry.js): who asked to be
   what, and the role field their free-text answer fills when they are added. */
const JOIN_KINDS = {
  developer: { label: 'Developer partner', role: null, field: null },
  realtor: { label: 'Realtor', role: 'realtor', field: 'areas' },
  creator: { label: 'Creator', role: 'creator', field: 'handle' },
  studio: { label: 'Studio editor', role: 'studio', field: 'skill' },
};

/* The website folds the email into the request's note; it has its own field. */
const joinDetails = (r) =>
  (r.details || '').split(' · ').filter((part) => !part.startsWith('Email:')).join(' · ');

/* A starting username from the name: "Priya S. Rao" -> "priya.s.rao". */
const suggestUsername = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 32);

/* A deactivated account is off regardless of who is at their desk, so the flag
   wins over the presence field. */
function statusOf(u) {
  if (!u.active) return { label: 'Deactivated', tone: 'off' };
  const p = (u.presence || 'online').toLowerCase();
  if (p === 'away') return { label: 'Away', tone: 'away' };
  if (p === 'offline') return { label: 'Offline', tone: 'idle' };
  return { label: 'Online', tone: 'on' };
}

/* Where a partner is in the member lifecycle: account created -> first
   sign-in -> onboarding (KYC verified + rules acknowledged), with the
   reminders and Core escalation the automations have sent along the way. */
function onboardingOf(u) {
  if (!['realtor', 'creator', 'studio'].includes(u.role)) return null;
  if (u.onboarding_completed_at) return { label: 'Complete', tone: 'on' };
  if (u.onboarding_escalated_at) return { label: 'Needs a call — 2 reminders ignored', tone: 'off' };
  const reminders = u.onboarding_reminders
    ? ` · ${u.onboarding_reminders} reminder${u.onboarding_reminders > 1 ? 's' : ''} sent`
    : '';
  if (!u.first_login_at) return { label: `Not signed in yet${reminders}`, tone: 'idle' };
  if (u.kyc_status === 'pending' && u.rules_ack_at) return { label: 'KYC waiting on review', tone: 'away' };
  return { label: `In progress${reminders}`, tone: 'away' };
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
  const [requests, setRequests] = useState([]);
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
      /* Its own catch: a hiccup here should not blank the rosters. */
      api.users.joinRequests().then((r) => setRequests(r.requests)).catch(() => {});
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

  const openRequests = requests.filter((r) => r.status === 'new');

  const visibleRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q)
    );
  }, [requests, search]);

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

  /* Add Member, filled in from the request. The role and username are only
     suggestions: whoever adds them can change anything before saving. */
  function addFromRequest(r) {
    const kind = JOIN_KINDS[r.kind];
    const role = creatable.includes(kind.role) ? kind.role : creatable[0] || '';
    setForm({
      ...EMPTY,
      name: r.name,
      username: suggestUsername(r.name),
      email: r.email || '',
      phone: r.phone || '',
      role,
      ...(kind.field && role === kind.role ? { [kind.field]: joinDetails(r) } : {}),
      joinRequestId: r.id,
    });
    setFormError('');
    setModalOpen(true);
  }

  async function declineRequest(r) {
    if (!window.confirm(`Decline ${r.name}'s request to join?`)) return;
    try {
      await api.users.declineJoin(r.id);
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not decline that request');
    }
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
      if (form.joinRequestId) payload.joinRequestId = form.joinRequestId;
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

  /* Founder only — the server refuses anyone else. The email is a login, so
     the person signs in with the new address from now on. */
  async function changeEmail(user) {
    const next = window.prompt(`New email for ${user.name}:`, user.email);
    if (next === null || next.trim().toLowerCase() === user.email) return;
    try {
      await api.users.update(user.id, { email: next.trim() });
      setBanner(`${user.name} now signs in with ${next.trim().toLowerCase()}.`);
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not change that email');
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

  /* Permanent deletion, offered only once an account is already deactivated —
     so switching someone off and erasing them can never be the same click.
     The work they did is kept but becomes unowned; the login is gone. */
  async function deleteForever(user) {
    const typed = window.prompt(
      `This permanently deletes ${user.name} from the database. It cannot be undone.\n\n` +
        `Their leads, listings and visits are kept but will no longer be assigned to anyone, ` +
        `and the login "${user.username}" stops working immediately.\n\n` +
        `Type DELETE to confirm.`
    );
    if (typed !== 'DELETE') return;

    setError('');
    try {
      await api.users.remove(user.id);
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not delete that account');
    }
  }

  function hide(userId) {
    setRevealed(({ [userId]: _gone, ...rest }) => rest);
  }

  /* Copy the password on its own.

     This used to copy a three-line block — a heading, the username and the
     password — which is right for pasting into a chat and wrong for pasting
     into a login box. People did the latter and got "Invalid username or
     password" back, with no way to tell why. "Copy all" below still produces
     the block for handing over. */
  async function copyFor(userId, text, kind) {
    const ok = await copyText(text);
    setCopied(ok ? `${userId}:${kind}` : '');
    if (!ok) setError('Could not copy — press and hold the password to copy it by hand');
  }

  const copyPassword = (u) => copyFor(u.id, String(revealed[u.id] || '').trim(), 'pw');

  const copyLogin = (u) =>
    copyFor(
      u.id,
      `Xspace & Co. Portal\nUsername: ${u.username}\nPassword: ${String(revealed[u.id] || '').trim()}`,
      'all'
    );

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
            <button
              className={'teams-tab' + (tab === 'requests' ? ' is-active' : '')}
              onClick={() => setTab('requests')}
            >
              Join requests
              {openRequests.length > 0 && <span className="teams-count">{openRequests.length}</span>}
            </button>
            <button
              className={'teams-tab' + (tab === 'emails' ? ' is-active' : '')}
              onClick={() => setTab('emails')}
            >
              Email log
            </button>
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

        {tab === 'emails' ? (
          <EmailLog search={search} />
        ) : tab === 'requests' ? (
          visibleRequests.length === 0 ? (
            <div className="teams-empty">
              {search
                ? 'Nobody matches that search.'
                : 'No requests yet. They arrive from the partner forms on the website.'}
            </div>
          ) : (
            <div className="teams-grid">
              {visibleRequests.map((r) => (
                <article key={r.id} className={'tcard' + (r.status === 'new' ? '' : ' is-off')}>
                  <div className="tcard-top">
                    <div className="tcard-avatar">{r.name.trim().charAt(0).toUpperCase()}</div>
                    <div className="tcard-id">
                      <div className="tcard-name">{r.name}</div>
                      <div className="tcard-role">Wants to join as {JOIN_KINDS[r.kind].label.toLowerCase()}</div>
                    </div>
                    <div
                      className={
                        'tcard-status is-' + (r.status === 'new' ? 'away' : r.status === 'added' ? 'on' : 'off')
                      }
                    >
                      <span className="tcard-dot" />
                      {r.status === 'new' ? 'New' : r.status === 'added' ? 'Added' : 'Declined'}
                    </div>
                  </div>

                  <dl className="tcard-fields">
                    <div>
                      <dt>Phone</dt>
                      <dd>{r.phone || '—'}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{r.email || '—'}</dd>
                    </div>
                    {joinDetails(r) && (
                      <div>
                        <dt>Details</dt>
                        <dd>{joinDetails(r)}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Received</dt>
                      <dd>
                        {new Date(r.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </dd>
                    </div>
                    {r.status !== 'new' && (
                      <div>
                        <dt>{r.status === 'added' ? 'Added' : 'Declined'}</dt>
                        <dd>
                          {r.handled_by_name ? `by ${r.handled_by_name}` : '—'}
                          {r.status === 'added' && r.user_name ? ` as ${r.user_name}` : ''}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {r.status === 'new' && (
                    <div className="tcard-actions">
                      <button className="teams-link danger" onClick={() => declineRequest(r)}>
                        Decline
                      </button>
                      {creatable.length > 0 && (
                        <button className="teams-link" onClick={() => addFromRequest(r)}>
                          Add to team
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )
        ) : loading ? (
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
              const onboarding = onboardingOf(u);

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
                            {/* Password only — this is the one that gets
                                pasted into a login box. */}
                            <button className="teams-link" onClick={() => copyPassword(u)}>
                              {copied === `${u.id}:pw` ? 'Copied' : 'Copy password'}
                            </button>
                            {/* Username and password together, for sending. */}
                            <button className="teams-link" onClick={() => copyLogin(u)}>
                              {copied === `${u.id}:all` ? 'Copied' : 'Copy all'}
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
                      <dd>
                        {u.email}
                        {isFounder && (
                          <>
                            {' '}
                            <button className="teams-link" onClick={() => changeEmail(u)}>Change</button>
                          </>
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt>Phone</dt>
                      <dd>{u.phone || '—'}</dd>
                    </div>

                    {onboarding && (
                      <div>
                        <dt>Onboarding</dt>
                        <dd className={'tcard-onboarding is-' + onboarding.tone}>{onboarding.label}</dd>
                      </div>
                    )}
                  </dl>

                  {isFounder && u.id !== me?.id && (
                    <div className="tcard-actions">
                      {/* Deleting is only reachable from the deactivated
                          state, so it is never one slip away from a live
                          account. */}
                      {!u.active && (
                        <button className="teams-link danger" onClick={() => deleteForever(u)}>
                          Delete permanently
                        </button>
                      )}
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
            {form.joinRequestId && (
              <p className="teams-form-hint">
                From a website join request. Check the role and username before adding.
              </p>
            )}
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
