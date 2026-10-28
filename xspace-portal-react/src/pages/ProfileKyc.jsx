import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import FileField from '../components/FileField';
import { ROLES, seesEverything } from '../lib/roleConfig';
import { timeAgo } from '../lib/time';
import { GENERAL_RULES, ROLE_RULES, RULES_VERSION } from '../lib/rules';
import { RuleBlock, RulesAck } from './Rules';
import { useDashboard } from './dashboard/DashboardStore';
import { Chip, Empty, Section } from './dashboard/partner/shared';
import './dashboard/partner/partner.css';

/* Profile & KYC.

   Everyone edits their own profile here. Partners also submit KYC — identity
   documents and where payouts go — which Founder or Core then verify or send
   back with a reason — and accept the partner terms, so onboarding is done
   on one page. Founder and Core get the review queue in place of a
   KYC form of their own: Partner compliance, which also shows who has
   acknowledged the rules. */

const STAMP = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function kycState(u) {
  const submitted = u?.kycSubmittedAt ?? u?.kyc_submitted_at;
  const status = u?.kycStatus ?? u?.kyc_status;
  if (!submitted) return { label: 'Not submitted', tone: 'grey' };
  if (status === 'verified') return { label: '✓ Verified', tone: 'green' };
  if (status === 'rejected') return { label: 'Changes needed', tone: 'red' };
  return { label: 'Pending review', tone: 'amber' };
}

function Input({ label, hint, ...props }) {
  return (
    <label>
      <span>{label}</span>
      <input className="pd-input" {...props} />
      {hint && <em className="pk-hint">{hint}</em>}
    </label>
  );
}

/* ---------- Profile ---------- */
export function ProfileSection({ me, role, refresh }) {
  const [form, setForm] = useState({ name: '', phone: '', areas: '', platform: '', handle: '', skill: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!me) return;
    setForm({
      name: me.name || '', phone: me.phone || '', areas: me.areas || '',
      platform: me.platform || '', handle: me.handle || '', skill: me.skill || '',
    });
  }, [me]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Name cannot be empty');
    setBusy(true);
    try {
      await api.users.updateProfile(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])));
      await refresh();
      setMsg('Profile saved');
      setTimeout(() => setMsg(''), 2500);
    } catch (err) {
      setError(err.message || 'Could not save your profile');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="👤 Profile" subtitle="How you appear to the Xspace team">
      <form onSubmit={save} autoComplete="off">
        <div className="qt-form pk-form">
          <Input label="Full name" value={form.name} onChange={set('name')} />
          <Input label="Phone" value={form.phone} onChange={set('phone')} inputMode="tel" placeholder="10-digit number" />
          <Input label="Email" value={me?.email || ''} readOnly />
          <Input label="Username" value={me?.username || ''} readOnly hint="Used to sign in" />
          <Input label="Role" value={ROLES[role]?.label || role} readOnly />
          {role === 'realtor' && (
            <Input label="Areas you cover" value={form.areas} onChange={set('areas')} placeholder="Kokapet, Narsingi, Tellapur" hint="Comma-separated — used for Area Updates" />
          )}
          {role === 'creator' && (
            <>
              <label>
                <span>Main platform</span>
                <select value={form.platform} onChange={set('platform')}>
                  <option value="">Select…</option>
                  <option value="instagram">Instagram</option>
                  <option value="youtube">YouTube</option>
                  <option value="facebook">Facebook</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <Input label="Handle" value={form.handle} onChange={set('handle')} placeholder="@yourhandle" />
            </>
          )}
          {role === 'studio' && (
            <Input label="Skill" value={form.skill} onChange={set('skill')} placeholder="Editor / camera / VR / design" />
          )}
        </div>
        <div className="pk-actions">
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
          {msg && <span className="pk-saved">{msg}</span>}
        </div>
        {error && <div className="pd-error">{error}</div>}
      </form>
    </Section>
  );
}

/* ---------- KYC (partners) ---------- */
const KYC_EMPTY = {
  panNumber: '', aadhaarLast4: '', address: '', reraAgentNo: '', panDocUrl: '', aadhaarDocUrl: '',
  bankHolder: '', bankAccount: '', bankIfsc: '', bankName: '', upiId: '',
};

function KycSection({ me, role, refresh }) {
  const [form, setForm] = useState(KYC_EMPTY);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!me) return;
    setForm(Object.fromEntries(Object.keys(KYC_EMPTY).map((k) => [k, me[k] || ''])));
  }, [me]);

  const state = kycState(me);
  const submitted = Boolean(me?.kycSubmittedAt);
  const open = editing || !submitted;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.users.submitKyc(form);
      await refresh();
      setEditing(false);
    } catch (err) {
      setError(err.message || 'Could not submit your KYC');
    } finally {
      setBusy(false);
    }
  }

  const mask = (v) => (v ? '•••• ' + String(v).slice(-4) : '—');

  return (
    <Section title="🪪 KYC & Payouts" subtitle="Required before commissions can be paid">
      <div className="pk-status">
        <Chip tone={state.tone}>{state.label}</Chip>
        {me?.kycSubmittedAt && (
          <span className="small muted">
            Submitted {STAMP.format(new Date(me.kycSubmittedAt))}
            {me.kycReviewedAt ? ` • reviewed ${STAMP.format(new Date(me.kycReviewedAt))}` : ''}
          </span>
        )}
      </div>
      {me?.kycStatus === 'rejected' && me?.kycNote && (
        <div className="pd-quote">What to fix: “{me.kycNote}”</div>
      )}

      {!open ? (
        <>
          <div className="pd-figures pk-summary">
            <div className="pd-figure"><div className="pd-figure-label">PAN</div><div>{me.panNumber || '—'}</div></div>
            <div className="pd-figure"><div className="pd-figure-label">Aadhaar</div><div>{me.aadhaarLast4 ? `XXXX XXXX ${me.aadhaarLast4}` : '—'}</div></div>
            <div className="pd-figure"><div className="pd-figure-label">Bank account</div><div>{mask(me.bankAccount)} {me.bankIfsc || ''}</div></div>
            <div className="pd-figure"><div className="pd-figure-label">UPI</div><div>{me.upiId || '—'}</div></div>
          </div>
          <div className="pk-actions">
            <button className="btn-ghost" onClick={() => setEditing(true)}>
              {me.kycStatus === 'rejected' ? 'Fix and resubmit' : 'Update details'}
            </button>
            {me.kycStatus === 'verified' && (
              <span className="small muted">Changing details sends your KYC back for review.</span>
            )}
          </div>
        </>
      ) : (
        <form onSubmit={submit} autoComplete="off">
          <h5 className="pk-sub">Identity</h5>
          <div className="qt-form pk-form">
            <Input label="PAN" value={form.panNumber} onChange={set('panNumber')} placeholder="ABCDE1234F" maxLength={10} style={{ textTransform: 'uppercase' }} />
            <Input label="Aadhaar — last 4 digits" value={form.aadhaarLast4} onChange={set('aadhaarLast4')} inputMode="numeric" maxLength={4} placeholder="1234" hint="Only the last four are stored" />
            {role === 'realtor' && (
              <Input label="TG RERA agent registration no." value={form.reraAgentNo} onChange={set('reraAgentNo')} placeholder="If registered" />
            )}
            <label className="au-wide">
              <span>Address</span>
              <textarea className="pd-input" rows={2} value={form.address} onChange={set('address')} placeholder="Current address" />
            </label>
          </div>
          <div className="pk-docs">
            <FileField label="PAN card" value={form.panDocUrl} onChange={(url) => setForm((f) => ({ ...f, panDocUrl: url }))} accept="application/pdf,image/*" hint="Photo or PDF, up to 8 MB" />
            <FileField label="Aadhaar card" value={form.aadhaarDocUrl} onChange={(url) => setForm((f) => ({ ...f, aadhaarDocUrl: url }))} accept="application/pdf,image/*" hint="You may mask the first 8 digits" />
          </div>

          <h5 className="pk-sub">Payouts</h5>
          <div className="qt-form pk-form">
            <Input label="Account holder name" value={form.bankHolder} onChange={set('bankHolder')} />
            <Input label="Account number" value={form.bankAccount} onChange={set('bankAccount')} inputMode="numeric" />
            <Input label="IFSC" value={form.bankIfsc} onChange={set('bankIfsc')} placeholder="HDFC0001234" maxLength={11} style={{ textTransform: 'uppercase' }} />
            <Input label="Bank name" value={form.bankName} onChange={set('bankName')} />
            <Input label="UPI id (optional)" value={form.upiId} onChange={set('upiId')} placeholder="name@okhdfc" />
          </div>

          <div className="pk-actions">
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit for verification'}</button>
            {submitted && <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
          {error && <div className="pd-error">{error}</div>}
        </form>
      )}
    </Section>
  );
}

/* ---------- Partner compliance (Founder / Core) ---------- */
function ComplianceSection() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('review');

  const load = useCallback(async () => {
    try {
      const out = await api.users.kycQueue();
      setPartners(out.partners || []);
    } catch (err) {
      setError(err.message || 'Could not load partners');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function review(p, decision) {
    setError('');
    if (decision === 'reject' && !note.trim()) return setError('Write what the partner needs to fix');
    setBusy(true);
    try {
      await api.users.reviewKyc(p.id, decision, note.trim() || null);
      setNote('');
      setOpenId(null);
      await load();
    } catch (err) {
      setError(err.message || 'Could not record that review');
    } finally {
      setBusy(false);
    }
  }

  const waiting = partners.filter((p) => p.kyc_submitted_at && p.kyc_status === 'pending');
  const visible =
    filter === 'review' ? waiting
      : filter === 'missing' ? partners.filter((p) => !p.kyc_submitted_at)
        : partners;
  const acked = (p) => p.rules_ack_at && new Date(p.rules_ack_at) >= new Date(RULES_VERSION);

  return (
    <Section title="🛡️ Partner Compliance" subtitle="KYC reviews and rules acknowledgement">
      <div className="au-filters">
        {[
          ['review', `To review (${waiting.length})`],
          ['missing', 'KYC not submitted'],
          ['all', 'All partners'],
        ].map(([k, label]) => (
          <button key={k} className={filter === k ? 'btn' : 'btn-ghost'} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      {error && <div className="pd-error">{error}</div>}
      {loading ? (
        <Empty>Loading…</Empty>
      ) : visible.length === 0 ? (
        <Empty>{filter === 'review' ? 'No KYC waiting for review.' : 'Nobody here.'}</Empty>
      ) : (
        <div className="pd-list">
          {visible.map((p) => {
            const st = kycState(p);
            const isOpen = openId === p.id;
            return (
              <div className="pd-item pk-partner" key={p.id}>
                <div className="pd-item-main">
                  <div className="pd-item-title">{p.name}</div>
                  <div className="pd-item-meta">
                    {ROLES[p.role]?.label} • {p.phone || p.email}
                    {p.kyc_submitted_at ? ` • submitted ${timeAgo(p.kyc_submitted_at)}` : ''}
                    {p.kyc_reviewed_by_name ? ` • reviewed by ${p.kyc_reviewed_by_name}` : ''}
                  </div>
                  <div className="pd-item-meta">
                    Rules: {acked(p) ? `✓ acknowledged ${STAMP.format(new Date(p.rules_ack_at))}` : 'not acknowledged'}
                  </div>

                  {isOpen && (
                    <div className="pk-review">
                      <div className="pd-figures">
                        <div className="pd-figure"><div className="pd-figure-label">PAN</div><div>{p.pan_number || '—'}</div></div>
                        <div className="pd-figure"><div className="pd-figure-label">Aadhaar (last 4)</div><div>{p.aadhaar_last4 || '—'}</div></div>
                        {p.role === 'realtor' && (
                          <div className="pd-figure"><div className="pd-figure-label">RERA agent no.</div><div>{p.rera_agent_no || '—'}</div></div>
                        )}
                        {/* One box per bank detail, so each can be checked against the documents. */}
                        <div className="pd-figure"><div className="pd-figure-label">Account holder</div><div>{p.bank_holder || '—'}</div></div>
                        <div className="pd-figure"><div className="pd-figure-label">Account number</div><div className="pk-mono">{p.bank_account || '—'}</div></div>
                        <div className="pd-figure"><div className="pd-figure-label">IFSC</div><div className="pk-mono">{p.bank_ifsc || '—'}</div></div>
                        <div className="pd-figure"><div className="pd-figure-label">Bank name</div><div>{p.bank_name || '—'}</div></div>
                        <div className="pd-figure"><div className="pd-figure-label">UPI</div><div>{p.upi_id || '—'}</div></div>
                      </div>
                      <div className="pd-item-meta">Address: {p.address || '—'}</div>
                      <div className="pd-item-actions">
                        {p.pan_doc_url && <a className="btn-ghost" href={p.pan_doc_url} target="_blank" rel="noopener noreferrer">PAN card ↗</a>}
                        {p.aadhaar_doc_url && <a className="btn-ghost" href={p.aadhaar_doc_url} target="_blank" rel="noopener noreferrer">Aadhaar card ↗</a>}
                      </div>
                      {p.kyc_submitted_at && (
                        <>
                          <textarea
                            className="pd-input pk-note"
                            rows={2}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Note to the partner (required to send back)"
                          />
                          <div className="pd-item-actions">
                            <button className="btn" disabled={busy} onClick={() => review(p, 'verify')}>Verify KYC</button>
                            <button className="btn-ghost" disabled={busy} onClick={() => review(p, 'reject')}>Send back</button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="pd-item-side">
                  <Chip tone={st.tone}>{st.label}</Chip>
                  <button className="pd-link" onClick={() => { setOpenId(isOpen ? null : p.id); setNote(''); }}>
                    {isOpen ? 'Close' : p.kyc_submitted_at ? 'Review' : 'Details'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/* ---------- Terms ---------- */

/* The partner rules, accepted here next to KYC so a new partner finishes
   onboarding on one page. The same rules and acknowledgement as the Rules &
   Guidelines page. */
function TermsSection({ me, role, refresh }) {
  const own = ROLE_RULES[role];
  return (
    <Section title="📜 Terms & conditions" subtitle="Read and accept to finish onboarding">
      <div className="pk-terms">
        {own && <RuleBlock sections={own.sections} />}
        <RuleBlock sections={GENERAL_RULES} />
      </div>
      <RulesAck currentUser={me} refresh={refresh} bare />
    </Section>
  );
}

export default function ProfileKyc() {
  const { role, currentUser, refresh } = useDashboard();
  const internal = seesEverything(role);

  return (
    <div className="pd">
      <header className="pd-hero">
        <h1>Profile &amp; KYC</h1>
        <p>{internal ? 'Your profile, and partner KYC waiting for review.' : 'Your details, identity documents and payout account.'}</p>
      </header>

      <div className="pd-grid pk-grid">
        <div className="pd-col">
          {internal ? (
            <ComplianceSection />
          ) : (
            <>
              <KycSection me={currentUser} role={role} refresh={refresh} />
              <TermsSection me={currentUser} role={role} refresh={refresh} />
            </>
          )}
        </div>
        <aside className="pd-col">
          <ProfileSection me={currentUser} role={role} refresh={refresh} />
        </aside>
      </div>
    </div>
  );
}
