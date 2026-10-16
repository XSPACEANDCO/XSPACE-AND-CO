import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { timeAgo } from '../lib/time';
import api from '../lib/api';
import {
  BHK_OPTIONS, DROPPED, LEAD_STATUSES, PROPERTY_TYPES,
  canAdvance, configKindFor, configLabelFor, propertyFullLabel, statusRank, subtypesFor,
} from '../lib/leadStatus';
import { seesEverything } from '../lib/roleConfig';
import { useDashboard } from './dashboard/DashboardStore';
import ClientJourney, { JourneyStrip } from './ClientJourney';
import JourneyDeal from './JourneyDeal';
import { ActivityHistory, EmailHistory } from './JourneyHistory';
import { Field, PersonSelect, Stage, stamp } from './journeyShared';
import './leadview.css';

/* One client.

   Founder and Core get the whole profile: client information, the status
   pipeline, and the journey from outreach to referral with its email and
   activity history and the internal notes. It all comes from one read,
   GET /journey/:id, and every step reloads it.

   A creator partner gets a read-only card for a lead they generated — who,
   where it came from, and how far it has got. The server sends them nothing
   more (routes/leads.js). Realtor partners have no CRM. */

export default function LeadView() {
  const { role } = useDashboard();
  return seesEverything(role) ? <ClientProfile /> : <PartnerLeadCard />;
}

const PURPOSES = ['Own use', 'Investment', 'Rental income', 'Business use', 'Other'];

function requirementFrom(lead) {
  return {
    budget: lead.budget || '',
    preferredArea: lead.preferred_area || '',
    propertyType: lead.property_type || '',
    propertySubtype: lead.property_subtype || '',
    configuration: lead.configuration || '',
    purpose: lead.purpose || '',
    timeline: lead.timeline || '',
    otherPreferences: lead.other_preferences || '',
  };
}

function ClientProfile() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { role } = useDashboard();

  const [data, setData] = useState(null);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);

  const [req, setReq] = useState(requirementFrom({}));
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const out = await api.journey.get(id);
      setData(out);
      setReq(requirementFrom(out.lead));
      setNote(out.lead.notes || '');
    } catch (err) {
      setError(err.message || 'Could not load this client');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  /* The whole book: any listing can be discussed in a presentation or a
     negotiation; the shortlist and visit pickers narrow it to verified. */
  useEffect(() => {
    api.listings
      .list({ include: 'all' })
      .then((out) => setListings(out.listings || []))
      .catch(() => setListings([]));
  }, []);

  /* Perform a step, reload the client, say what happened. Resolves true on
     success so a form can clear itself. */
  const run = useCallback(
    async (fn, done) => {
      setError('');
      setBusy(true);
      try {
        await fn();
        await load();
        if (done) {
          setFlash(done);
          setTimeout(() => setFlash(''), 3500);
        }
        return true;
      } catch (err) {
        setError(err.message || 'That did not work');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  const patch = (body, done) => run(() => api.leads.update(id, body), done);

  const setReqField = (key) => (e) => {
    const value = e.target.value;
    setReq((r) =>
      key === 'propertyType'
        ? { ...r, propertyType: value, propertySubtype: '', configuration: '' }
        : { ...r, [key]: value }
    );
  };

  /* Founder only; the server refuses anyone else. */
  async function removeLead() {
    if (!window.confirm(`Delete client "${data.lead.name}"?

Their site visits and history are deleted with them. This cannot be undone.`))
      return;
    setError('');
    setBusy(true);
    try {
      await api.leads.remove(id);
      navigate('/clients', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not delete this client');
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="page-leadview">
        <div className="container"><div className="section"><div className="muted">Loading…</div></div></div>
      </div>
    );
  }

  if (!data) return <NotFound error={error} />;

  const { lead, team, emailBlocker } = data;
  const current = lead.status;
  const configKind = configKindFor(req.propertyType);
  const emailNote = emailBlocker ? ` (not emailed: ${emailBlocker.toLowerCase()})` : '';
  const shared = { data, leadId: id, listings, run, busy, emailNote };

  const requirement = (
    <Stage
      n={3}
      id="stage-3"
      title="Requirement"
      done={Boolean(lead.budget || lead.preferred_area || lead.property_type)}
    >
      <div className="muted">What Xspace uses to pick suitable projects.</div>
      <div className="req-grid">
        <Field label="Budget">
          <input value={req.budget} onChange={setReqField('budget')} placeholder="₹70 – 90 Lakhs" />
        </Field>
        <Field label="Preferred area">
          <input value={req.preferredArea} onChange={setReqField('preferredArea')} placeholder="Kukatpally / Hitech City" />
        </Field>
        <Field label="Property type">
          <select value={req.propertyType} onChange={setReqField('propertyType')}>
            <option value="">Select…</option>
            {PROPERTY_TYPES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </Field>
        {subtypesFor(req.propertyType).length > 0 && (
          <Field label="Sub-type">
            <select value={req.propertySubtype} onChange={setReqField('propertySubtype')}>
              <option value="">Select…</option>
              {subtypesFor(req.propertyType).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
        )}
        <Field label={configLabelFor(req.propertyType)}>
          {configKind === 'bhk' ? (
            <select value={req.configuration} onChange={setReqField('configuration')}>
              <option value="">Select…</option>
              {BHK_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          ) : (
            <input
              value={req.configuration}
              onChange={setReqField('configuration')}
              placeholder={configKind === 'acres' ? 'e.g. 2.5 acres' : configKind === 'sft' ? 'e.g. 1200 sft' : 'Pick a property type first'}
              disabled={!configKind}
            />
          )}
        </Field>
        <Field label="Purpose">
          <select value={req.purpose} onChange={setReqField('purpose')}>
            <option value="">Select…</option>
            {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Timeline">
          <input value={req.timeline} onChange={setReqField('timeline')} placeholder="Immediate (30 days)" />
        </Field>
      </div>
      <Field label="Other preferences" wide>
        <textarea rows={2} value={req.otherPreferences} onChange={setReqField('otherPreferences')} placeholder="East facing, high floor, near a school" />
      </Field>
      <div className="note-actions">
        <button disabled={busy} onClick={() => patch(req, 'Requirement saved')}>
          {busy ? 'Saving…' : 'Save Requirement'}
        </button>
      </div>
    </Stage>
  );

  return (
    <div className="page-leadview">
      <div className="container">
        {/* Errors and confirmations stay in view while scrolling a long profile. */}
        <div className="lv-toast" aria-live="polite">
          {error && <div className="crm-error">{error}</div>}
          {flash && <div className="lv-flash">{flash}</div>}
        </div>

        {/* CLIENT INFORMATION */}
        <div className="section">
          <div className="header-top">
            <div className="client-name">{lead.name}</div>
            {lead.referred_by && <div className="muted">🤝 Referred by another client</div>}
          </div>

          <div className="lv-info">
            <div className="lv-info-row">
              <span className="lv-info-label">Phone</span>
              <span>
                {lead.phone || '—'}
                <button
                  type="button"
                  className="lv-inline-btn"
                  disabled={busy}
                  onClick={() => {
                    const next = window.prompt('Client phone:', lead.phone || '');
                    if (next !== null && next.trim()) patch({ phone: next.trim() }, 'Phone updated');
                  }}
                >
                  Edit
                </button>
              </span>
            </div>
            <div className="lv-info-row">
              <span className="lv-info-label">Email</span>
              <span>
                {lead.email || <span className="muted">None — the client gets no emails</span>}
                <button
                  type="button"
                  className="lv-inline-btn"
                  disabled={busy}
                  onClick={() => {
                    const next = window.prompt('Client email (leave empty to remove):', lead.email || '');
                    if (next !== null) patch({ email: next.trim() }, 'Email updated');
                  }}
                >
                  {lead.email ? 'Edit' : 'Add'}
                </button>
              </span>
            </div>
            <div className="lv-info-row">
              <span className="lv-info-label">Lead source</span>
              <span>{lead.source || '—'}</span>
            </div>
            <div className="lv-info-row">
              <span className="lv-info-label">Lead owner</span>
              <PersonSelect
                value={lead.assigned_to}
                onChange={(v) => v && patch({ assignedTo: v }, 'Lead owner changed')}
                people={team}
                empty="Unassigned"
              />
            </div>
            <div className="lv-info-row">
              <span className="lv-info-label">Temperature</span>
              <select value={lead.temperature} onChange={(e) => patch({ temperature: e.target.value }, 'Temperature updated')} disabled={busy}>
                <option value="hot">🔥 Hot</option>
                <option value="warm">🌤️ Warm</option>
                <option value="cold">❄️ Cold</option>
              </select>
            </div>
            <div className="lv-info-row">
              <span className="lv-info-label">Added</span>
              <span>{stamp(lead.created_at)} <span className="muted">· {timeAgo(lead.created_at)}</span></span>
            </div>
          </div>

          {/* A lead moves forward or it drops out. Earlier stages are
              disabled here, and the server refuses them regardless. Most
              stages also move on their own as the journey below happens. */}
          <div className="status-wrap">
            <div className="muted">Current Status</div>
            <div className="status-badge">{current}</div>
            <div className="actions">
              {LEAD_STATUSES.map((s) => {
                const allowed = canAdvance(current, s);
                const isCurrent = s === current;
                return (
                  <button
                    key={s}
                    className={'action' + (isCurrent ? ' current' : '')}
                    disabled={!allowed || busy}
                    title={isCurrent ? 'Current status' : allowed ? `Move to ${s}` : `Already past ${s} — a lead cannot go backwards`}
                    onClick={() => {
                      /* Closing is a stage of its own, with the deal record
                         and the client's email — send it there. */
                      if (s === 'Closed') {
                        document.getElementById('stage-11')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        return;
                      }
                      patch({ status: s }, `Moved to ${s}`);
                    }}
                  >
                    {s === 'Token/EOI' ? 'Token / EOI' : s}
                  </button>
                );
              })}
              <button
                className="action drop"
                disabled={current === DROPPED || busy}
                onClick={() => {
                  if (window.confirm('Drop this client? This cannot be undone.')) patch({ status: DROPPED }, 'Client dropped');
                }}
              >
                Dropped
              </button>
            </div>
          </div>
        </div>

        <JourneyStrip data={data} />

        {emailBlocker && <div className="journey-warn lv-block">✉️ {emailBlocker} — steps are recorded but no email is sent.</div>}

        <ClientJourney {...shared} requirement={requirement} />
        <JourneyDeal {...shared} />
        <EmailHistory emails={data.emails} />
        <ActivityHistory activity={data.activity} />

        {/* INTERNAL NOTES — never sent to a partner or shown to the client. */}
        <div className="section">
          <h3>🔒 Internal Notes</h3>
          <div className="muted">
            Xspace only. Never visible to the client or to any partner.
          </div>
          <textarea
            rows={5}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={'Budget flexibility · Decision maker · Family involvement · Loan status · Investment purpose\nNegotiation position · Preferences · Important conversations · Observations · Next strategy'}
          />
          <div className="note-actions">
            <button disabled={busy} onClick={() => patch({ notes: note }, 'Notes saved')}>
              {busy ? 'Saving…' : 'Save Notes'}
            </button>
            <button className="ghost" onClick={() => navigate('/clients')}>Back to CRM</button>
            {role === 'founder' && (
              <button className="danger" disabled={busy} onClick={removeLead}>
                Delete Client
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NotFound({ error }) {
  const navigate = useNavigate();
  return (
    <div className="page-leadview">
      <div className="container">
        <div className="section">
          <h3>Client not found</h3>
          <div className="muted">{error || 'This client does not exist, or is not one of yours.'}</div>
          <div className="note-actions">
            <button onClick={() => navigate('/clients')}>Back</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* A creator's lead: read-only, status only. */
function PartnerLeadCard() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [lead, setLead] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.leads
      .get(id)
      .then((out) => setLead(out.lead))
      .catch((err) => setError(err.message || 'Could not load this lead'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="page-leadview">
        <div className="container"><div className="section"><div className="muted">Loading…</div></div></div>
      </div>
    );
  }
  if (!lead) return <NotFound error={error} />;

  const dropped = lead.status === DROPPED;
  const reached = statusRank(lead.status);
  const requirement = [
    lead.configuration,
    propertyFullLabel(lead.property_type, lead.property_subtype),
    lead.preferred_area,
    lead.budget,
  ].filter(Boolean).join(' • ');

  return (
    <div className="page-leadview">
      <div className="container">
        <div className="section">
          <div className="client-name">{lead.name}</div>
          <div className="muted">Added {stamp(lead.created_at)} · {timeAgo(lead.created_at)}</div>

          <div className="lv-info">
            <div className="lv-info-row">
              <span className="lv-info-label">From</span>
              <span>{lead.source_media_title ? `“${lead.source_media_title}”` : lead.source || '—'}</span>
            </div>
            <div className="lv-info-row">
              <span className="lv-info-label">Project</span>
              <span>{lead.listing_title || '—'}</span>
            </div>
            <div className="lv-info-row">
              <span className="lv-info-label">Requirement</span>
              <span>{requirement || '—'}</span>
            </div>
          </div>
        </div>

        <div className="section">
          <h3>Lead status</h3>
          <div className="status-badge">{lead.status === 'Token/EOI' ? 'Token / EOI' : lead.status}</div>
          {dropped ? (
            <div className="muted">This lead did not go ahead.</div>
          ) : (
            <ol className="journey-strip">
              {LEAD_STATUSES.map((s, i) => (
                <li key={s} className={i <= reached ? 'done' : ''}>
                  <span>
                    <span className="journey-strip-num">{i <= reached ? '✓' : i + 1}</span>
                    {s === 'Token/EOI' ? 'Token / EOI' : s}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <div className="muted">
            Xspace looks after this client from here — outreach, visits, negotiation and closing.
          </div>
          <div className="note-actions">
            <button className="ghost" onClick={() => navigate('/clients')}>Back to My Leads</button>
          </div>
        </div>
      </div>
    </div>
  );
}
