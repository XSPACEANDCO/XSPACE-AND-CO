import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { TEMP_LABELS } from '../lib/leadStatus';
import './sitevisits.css';

/* Site visits, on real data.

   Every visit here is one somebody booked against a real client and a real
   listing — the client and project dropdowns are populated from the CRM and
   the inventory rather than accepting free text, so a visit can never point
   at a project that does not exist.

   Which visits arrive is the server's decision: Founder and Core see all of
   them, a partner sees only their own. */

const COLUMNS = [
  { key: 'Scheduled', label: 'Scheduled' },
  { key: 'Completed', label: 'Completed' },
  { key: 'Unsuccessful', label: 'Unsuccessful Visit' },
  { key: 'Rescheduled', label: 'Rescheduled' },
];

const UNSUCCESS_REASONS = [
  'Client Unavailable',
  'No Response',
  'Client Not Confirmed',
  'Client Cancelled',
  'Decision Maker Not Available',
  'Budget Issue',
  'Location Not Liked',
  'Project Not Liked',
  'Unit Not Available',
  'Reschedule Requested',
  'Other (Add Note)',
];

const STAMP = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
});

const isSoon = (t) => {
  if (!t) return false;
  const d = new Date(t) - new Date();
  return d > 0 && d <= 2 * 60 * 60 * 1000;
};
const isOverdue = (t, s) => t && new Date(t) < new Date() && s === 'Scheduled';

export default function SiteVisits() {
  const [params] = useSearchParams();

  const [visits, setVisits] = useState([]);
  const [leads, setLeads] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [agentFilter, setAgentFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [form, setForm] = useState({ leadId: '', listingId: '', scheduledAt: '', mode: 'On-site' });

  const [rescheduleId, setRescheduleId] = useState(null);
  const [rescheduleTime, setRescheduleTime] = useState('');

  const [unsuccessId, setUnsuccessId] = useState(null);
  const [unsuccessReason, setUnsuccessReason] = useState('');

  /* Re-render once a minute so the "Soon" / "Overdue" rings stay truthful. */
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      /* The pickers are a convenience — if a partner cannot read the full
         inventory, the visit list still loads. */
      const [visitsOut, leadsOut, listingsOut] = await Promise.all([
        api.visits.list(),
        api.leads.list().catch(() => ({ leads: [] })),
        api.listings.list({ include: 'all' }).catch(() => ({ listings: [] })),
      ]);
      setVisits(visitsOut.visits || []);
      setLeads(leadsOut.leads || []);
      setListings(listingsOut.listings || []);
    } catch (err) {
      setError(err.message || 'Could not load site visits');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* Deep link from the lead page: /site-visits?dt=<datetime-local value> */
  useEffect(() => {
    const dt = params.get('dt');
    if (dt) {
      setForm((f) => ({ ...f, scheduledAt: dt }));
      setScheduleOpen(true);
    }
  }, [params]);

  const agents = useMemo(
    () => [...new Set(visits.map((v) => v.agent_name).filter(Boolean))].sort(),
    [visits]
  );

  const filtered = useMemo(
    () =>
      visits.filter(
        (v) =>
          (agentFilter === 'all' || v.agent_name === agentFilter) &&
          (modeFilter === 'all' || v.mode === modeFilter)
      ),
    [visits, agentFilter, modeFilter]
  );

  const todays = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = start.getTime() + 24 * 3600 * 1000;
    return filtered.filter((v) => {
      if (!v.scheduled_at) return false;
      const ts = new Date(v.scheduled_at).getTime();
      return ts >= start.getTime() && ts < end;
    });
  }, [filtered]);

  async function run(fn, onDone) {
    setError('');
    setBusy(true);
    try {
      await fn();
      await load();
      onDone?.();
    } catch (err) {
      setError(err.message || 'That change was refused');
    } finally {
      setBusy(false);
    }
  }

  function saveVisit() {
    if (!form.scheduledAt) return setError('Pick a date and time for the visit');
    if (!form.leadId) return setError('Choose which client this visit is for');
    run(
      () =>
        api.visits.create({
          leadId: form.leadId,
          listingId: form.listingId || null,
          scheduledAt: new Date(form.scheduledAt).toISOString(),
          mode: form.mode,
        }),
      () => {
        setScheduleOpen(false);
        setForm({ leadId: '', listingId: '', scheduledAt: '', mode: 'On-site' });
      }
    );
  }

  function confirmReschedule() {
    if (!rescheduleTime) return setError('Pick a new date and time');
    run(
      () => api.visits.reschedule(rescheduleId, new Date(rescheduleTime).toISOString()),
      () => {
        setRescheduleId(null);
        setRescheduleTime('');
      }
    );
  }

  function confirmUnsuccess() {
    if (!unsuccessReason) return setError('Select a reason');
    run(
      () => api.visits.unsuccessful(unsuccessId, unsuccessReason),
      () => {
        setUnsuccessId(null);
        setUnsuccessReason('');
      }
    );
  }

  function VisitCard({ v }) {
    const soon = isSoon(v.scheduled_at);
    const over = isOverdue(v.scheduled_at, v.status);
    return (
      <div className={'visit' + (soon ? ' soon' : '') + (over ? ' overdue' : '')}>
        <strong>{v.client_name || 'Client'}</strong>{' '}
        <span className={v.temperature}>{TEMP_LABELS[v.temperature] || ''}</span>
        <br />
        <span className="subtitle">{v.listing_title || 'No listing linked'}</span>
        <br />
        <span className="subtitle">
          {v.scheduled_at ? STAMP.format(new Date(v.scheduled_at)) : '—'} •{' '}
          {v.agent_name || 'Unassigned'} • {v.mode}
        </span>
        {v.reason && <div className="subtitle">Reason: {v.reason}</div>}
        {soon && <div className="warm">⏰ Soon</div>}
        {over && <div className="hot">⚠️ Overdue</div>}

        {v.status === 'Scheduled' && (
          <div className="visit-actions">
            <button
              className="action-btn"
              disabled={busy}
              onClick={() => run(() => api.visits.complete(v.id, ''))}
            >
              Done
            </button>
            <button className="action-btn" disabled={busy} onClick={() => setUnsuccessId(v.id)}>
              Unsuccessful
            </button>
            <button className="action-btn" disabled={busy} onClick={() => setRescheduleId(v.id)}>
              Reschedule
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-sitevisits">
      <div className="container">
        <div className="topbar">
          <div>
            <h1>Site Visits</h1>
            <div className="subtitle">Daily operations dashboard</div>
          </div>

          <div className="filters">
            <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
              <option value="all">All Agents</option>
              {agents.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}>
              <option value="all">All Modes</option>
              <option value="On-site">On-site</option>
              <option value="VR">VR</option>
            </select>
            <button onClick={() => { setScheduleOpen(true); setError(''); }}>+ Schedule Visit</button>
          </div>
        </div>

        {error && <div className="visits-error">{error}</div>}

        <h3>Today’s Visits</h3>
        <div className="today-strip">
          {loading ? (
            <div className="subtitle">Loading…</div>
          ) : todays.length === 0 ? (
            <div className="subtitle">No visits scheduled for today.</div>
          ) : (
            todays.map((v) => (
              <div className="card" key={v.id}>
                <strong>{v.client_name || 'Client'}</strong>{' '}
                <span className={v.temperature}>{TEMP_LABELS[v.temperature] || ''}</span>
                <div className="muted">{v.listing_title || '—'}</div>
                <div className="muted">
                  {v.scheduled_at ? STAMP.format(new Date(v.scheduled_at)) : '—'} •{' '}
                  {v.agent_name || 'Unassigned'} • {v.mode}
                </div>
              </div>
            ))
          )}
        </div>

        {!loading && visits.length === 0 && (
          <p className="subtitle">
            No site visits booked yet. Use “Schedule Visit” to book one against a client.
          </p>
        )}

        <div className="pipeline">
          {COLUMNS.map((col) => (
            <div className="col" key={col.key}>
              <h3>{col.label}</h3>
              <div>
                {filtered
                  .filter((v) => v.status === col.key)
                  .map((v) => (
                    <VisitCard v={v} key={v.id} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Schedule Modal */}
      {scheduleOpen && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setScheduleOpen(false)}>
          <div className="modal">
            <h3>Schedule Site Visit</h3>

            <label>Client</label>
            <select value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })}>
              <option value="">Select a client…</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}{l.phone ? ` — ${l.phone}` : ''}
                </option>
              ))}
            </select>
            {leads.length === 0 && (
              <div className="subtitle">No clients yet — add one in CRM first.</div>
            )}

            <label>Listing</label>
            <select value={form.listingId} onChange={(e) => setForm({ ...form, listingId: e.target.value })}>
              <option value="">No specific listing</option>
              {listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}{l.area ? ` — ${l.area}` : ''}
                </option>
              ))}
            </select>

            <label>Date &amp; Time</label>
            <input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
            />

            <label>Mode</label>
            <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              <option>On-site</option>
              <option>VR</option>
            </select>

            <div className="modal-actions">
              <button onClick={() => setScheduleOpen(false)}>Cancel</button>
              <button className="btn-save" disabled={busy} onClick={saveVisit}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleId !== null && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setRescheduleId(null)}>
          <div className="modal">
            <h3>Reschedule Visit</h3>
            <label>New Date &amp; Time</label>
            <input
              type="datetime-local"
              value={rescheduleTime}
              onChange={(e) => setRescheduleTime(e.target.value)}
            />
            <div className="modal-actions">
              <button onClick={() => setRescheduleId(null)}>Cancel</button>
              <button className="btn-save" disabled={busy} onClick={confirmReschedule}>
                {busy ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsuccessful Modal */}
      {unsuccessId !== null && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setUnsuccessId(null)}>
          <div className="modal">
            <h3>Mark Unsuccessful Visit</h3>
            <label>Reason</label>
            <select value={unsuccessReason} onChange={(e) => setUnsuccessReason(e.target.value)}>
              <option value="">Select reason</option>
              {UNSUCCESS_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <div className="modal-actions">
              <button onClick={() => setUnsuccessId(null)}>Cancel</button>
              <button className="btn-danger" disabled={busy} onClick={confirmUnsuccess}>
                {busy ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
