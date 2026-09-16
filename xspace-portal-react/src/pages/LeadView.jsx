import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePageClass } from '../hooks/usePageClass';
import { timeAgo } from '../lib/time';
import api from '../lib/api';
import {
  BHK_OPTIONS, DROPPED, LEAD_STATUSES, PROPERTY_TYPES,
  canAdvance, configKindFor, configLabelFor,
} from '../lib/leadStatus';
import './leadview.css';

const STAMP = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export default function LeadView() {
  usePageClass('leadview');
  const navigate = useNavigate();
  const { id } = useParams();

  const [lead, setLead] = useState(null);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /* Requirement snapshot, editable in place. */
  const [req, setReq] = useState({
    budget: '', preferredArea: '', propertyType: '', configuration: '', timeline: '',
  });
  const [reqSaved, setReqSaved] = useState('');

  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const out = await api.leads.get(id);
      setLead(out.lead);
      setVisits(out.visits || []);
      setReq({
        budget: out.lead.budget || '',
        preferredArea: out.lead.preferred_area || '',
        propertyType: out.lead.property_type || '',
        configuration: out.lead.configuration || '',
        timeline: out.lead.timeline || '',
      });
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

  async function patch(body, after) {
    setError('');
    setBusy(true);
    try {
      const out = await api.leads.update(id, body);
      setLead(out.lead);
      after?.();
    } catch (err) {
      setError(err.message || 'That change was refused');
    } finally {
      setBusy(false);
    }
  }

  const setReqField = (key) => (e) => {
    const value = e.target.value;
    setReq((r) => (key === 'propertyType' ? { ...r, propertyType: value, configuration: '' } : { ...r, [key]: value }));
  };

  if (loading) {
    return (
      <div className="page-leadview">
        <div className="container"><div className="section"><div className="muted">Loading…</div></div></div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="page-leadview">
        <div className="container">
          <div className="section">
            <h3>Client not found</h3>
            <div className="muted">{error || 'This client does not exist, or is not one of yours.'}</div>
            <div className="note-actions">
              <button onClick={() => navigate('/clients')}>Back to Clients</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const configKind = configKindFor(req.propertyType);
  const current = lead.status;

  return (
    <div className="page-leadview">
      <div className="container">
        {error && <div className="crm-error">{error}</div>}

        {/* HEADER */}
        <div className="section">
          <div className="header-top">
            <div className="client-name">
              {lead.name}{' '}
              {lead.temperature === 'hot' && <span className="hot">🔥 Hot</span>}
            </div>
            <div className="muted">📞 {lead.phone || 'No number on file'}</div>
            <div className="muted">🔗 Lead Source: {lead.source || '—'}</div>
            <div className="muted">👤 Lead Owner: {lead.assigned_to_name || 'Unassigned'}</div>
          </div>

          <div className="status-wrap">
            <div className="muted">Current Status</div>
            <div className="status-badge">{current}</div>
            <div className="muted">
              {lead.last_interaction_at
                ? `Last updated: ${STAMP.format(new Date(lead.last_interaction_at))}`
                : `Added: ${STAMP.format(new Date(lead.created_at))}`}
            </div>

            {/* A lead moves forward or it drops out. Earlier stages are
                disabled here, and the server refuses them regardless. */}
            <div className="actions">
              {LEAD_STATUSES.map((s) => {
                const allowed = canAdvance(current, s);
                const isCurrent = s === current;
                return (
                  <button
                    key={s}
                    className={'action' + (isCurrent ? ' current' : '')}
                    disabled={!allowed || busy}
                    title={
                      isCurrent ? 'Current status'
                        : allowed ? `Move to ${s}`
                          : `Already past ${s} — a lead cannot go backwards`
                    }
                    onClick={() => patch({ status: s })}
                  >
                    {s}
                  </button>
                );
              })}
              <button
                className="action drop"
                disabled={current === DROPPED || busy}
                onClick={() => {
                  if (window.confirm('Drop this lead? This cannot be undone.')) patch({ status: DROPPED });
                }}
              >
                Dropped
              </button>
            </div>
          </div>
        </div>

        {/* REQUIREMENT */}
        <div className="section">
          <h3>Requirement Snapshot</h3>
          <div className="req-grid">
            <label>
              <span>Budget</span>
              <input value={req.budget} onChange={setReqField('budget')} placeholder="₹70 – 90 Lakhs" />
            </label>
            <label>
              <span>Preferred Area</span>
              <input value={req.preferredArea} onChange={setReqField('preferredArea')} placeholder="Kukatpally / Hitech City" />
            </label>
            <label>
              <span>Property Type</span>
              <select value={req.propertyType} onChange={setReqField('propertyType')}>
                <option value="">Select…</option>
                {PROPERTY_TYPES.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{configLabelFor(req.propertyType)}</span>
              {configKind === 'bhk' ? (
                <select value={req.configuration} onChange={setReqField('configuration')}>
                  <option value="">Select…</option>
                  {BHK_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              ) : (
                <input
                  value={req.configuration}
                  onChange={setReqField('configuration')}
                  placeholder={
                    configKind === 'acres' ? 'e.g. 2.5 acres'
                      : configKind === 'sft' ? 'e.g. 1200 sft'
                        : 'Pick a property type first'
                  }
                  disabled={!configKind}
                />
              )}
            </label>
            <label>
              <span>Timeline</span>
              <input value={req.timeline} onChange={setReqField('timeline')} placeholder="Immediate (30 days)" />
            </label>
          </div>
          <div className="note-actions">
            <button
              disabled={busy}
              onClick={() => patch(req, () => {
                setReqSaved('Requirement saved');
                setTimeout(() => setReqSaved(''), 2500);
              })}
            >
              {busy ? 'Saving…' : 'Save Requirement'}
            </button>
            {reqSaved && <span className="saved-flag">{reqSaved}</span>}
          </div>
        </div>

        {/* SITE VISITS */}
        <div className="section">
          <h3>Site Visits</h3>
          {visits.length === 0 ? (
            <div className="muted">No site visits booked for this client yet.</div>
          ) : (
            visits.map((v) => (
              <div className="timeline-item" key={v.id}>
                <div>
                  <strong>{v.status}</strong>
                  {v.feedback ? ` – ${v.feedback}` : ''}
                </div>
                <div className="time">
                  {v.scheduled_at ? STAMP.format(new Date(v.scheduled_at)) : '—'} • {timeAgo(v.scheduled_at)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* NOTES */}
        <div className="section">
          <h3>Internal Notes</h3>
          <textarea
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What matters about this client — budget flexibility, who decides, loan status…"
          />
          <div className="note-actions">
            <button
              disabled={busy}
              onClick={() => patch({ notes: note }, () => {
                setNoteSaved('Note saved');
                setTimeout(() => setNoteSaved(''), 2500);
              })}
            >
              {busy ? 'Saving…' : 'Save Note'}
            </button>
            {noteSaved && <span className="saved-flag">{noteSaved}</span>}
            <button className="ghost" onClick={() => navigate('/clients')}>Back to Clients</button>
          </div>
        </div>
      </div>
    </div>
  );
}
