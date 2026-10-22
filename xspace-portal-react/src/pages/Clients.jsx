import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { timeAgo } from '../lib/time';
import api from '../lib/api';
import {
  ALL_STATUSES, BHK_OPTIONS, PROPERTY_TYPES, TEMP_LABELS,
  configKindFor, configLabelFor, propertyFullLabel, subtypesFor,
} from '../lib/leadStatus';
import { seesEverything } from '../lib/roleConfig';
import { useDashboard } from './dashboard/DashboardStore';
import './clients.css';

/* The CRM list, from the database.

   Which rows arrive is the server's decision: Founder and Core get every
   lead, a creator partner only the ones they generated — and of those only
   the name, source, requirement and status. There is no client-side
   filtering by owner here, because there is nothing to filter — the rows
   and fields that would need hiding never leave the server.

   Realtor partners have no CRM. They see a client only on the site visits
   assigned to them. */

const STAMP = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const DAY_STAMP = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
});

const EMPTY_FORM = {
  name: '', phone: '', email: '', source: 'Instagram', temperature: 'warm',
  budget: '', preferredArea: '', propertyType: '', propertySubtype: '', configuration: '', timeline: '',
  sourceMediaId: '', followUpAt: '',
};

const SOURCES = ['Instagram', 'Referral', 'Website', 'Walk-in', 'YouTube', 'Other'];

/* The filter tabs: every status, each with how many clients are in it. */
const TABS = [
  { key: 'all', label: 'All' },
  ...ALL_STATUSES.map((s) => ({ key: s, label: s === 'Token/EOI' ? 'Token / EOI' : s })),
];

function followUpCell(at) {
  if (!at) return <span className="source">—</span>;
  const overdue = new Date(at).getTime() < Date.now();
  return (
    <span className={overdue ? 'due overdue' : 'due'}>
      {DAY_STAMP.format(new Date(at))}
      {overdue && <span className="source">overdue</span>}
    </span>
  );
}

export default function Clients() {
  const navigate = useNavigate();
  const { role } = useDashboard();
  const internal = seesEverything(role);
  const [params, setParams] = useSearchParams();

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState(null);

  /* Deleting a client is the Founder's call alone — the server refuses it
     from anyone else. Their site visits go with them. */
  const canDelete = role === 'founder';
  async function removeClient(c) {
    if (!window.confirm(`Delete client "${c.name}"?

Their site visits are deleted with them. This cannot be undone.`))
      return;
    setError('');
    setDeleting(c.id);
    try {
      await api.leads.remove(c.id);
      setLeads((rows) => rows.filter((l) => l.id !== c.id));
    } catch (err) {
      setError(err.message || 'Could not delete that client');
    } finally {
      setDeleting(null);
    }
  }

  /* A creator's own uploads, so a new lead can credit the reel it came
     from. Founder and Core are not content sources, so they skip this. */
  const [myContent, setMyContent] = useState([]);
  useEffect(() => {
    if (!role || internal) return;
    api.media
      .mine()
      .then((out) => setMyContent(out.media || []))
      .catch(() => setMyContent([]));
  }, [role, internal]);

  /* "+ Add Lead" on a dashboard lands here with ?new=1. */
  useEffect(() => {
    if (params.get('new') === '1') {
      setFormOpen(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const out = await api.leads.list();
      setLeads(out.leads || []);
    } catch (err) {
      setError(err.message || 'Could not load clients');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* Search covers whatever the role was sent — contact details only reach
     Founder and Core, so only they can search on them. */
  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return leads;
    return leads.filter((c) =>
      [c.name, c.phone, c.email, c.preferred_area, c.source, c.assigned_to_name, c.budget, c.source_media_title, c.listing_title]
        .some((v) => v && String(v).toLowerCase().includes(needle))
    );
  }, [leads, q]);

  const counts = useMemo(() => {
    const out = { all: searched.length };
    for (const c of searched) out[c.status] = (out[c.status] || 0) + 1;
    return out;
  }, [searched]);

  /* "We have this": clients whose requirement fits a verified project. The
     server only sends matching_projects to Founder and Core. */
  const [matchedOnly, setMatchedOnly] = useState(false);
  const matchedCount = useMemo(() => searched.filter((c) => c.matching_projects?.length).length, [searched]);

  const visible = useMemo(() => {
    const rows = filter === 'all' ? searched : searched.filter((c) => c.status === filter);
    return matchedOnly ? rows.filter((c) => c.matching_projects?.length) : rows;
  }, [searched, filter, matchedOnly]);

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => {
      /* Switching property type changes what configuration even means, so the
         previous answer (say "3 BHK" on a plot of land) must not survive. */
      if (key === 'propertyType') return { ...f, propertyType: value, propertySubtype: '', configuration: '' };
      return { ...f, [key]: value };
    });
  };

  async function addClient(e) {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) return setFormError('Name is required');

    setBusy(true);
    try {
      const payload = { name: form.name.trim(), status: 'New' };
      /* How hot a lead is and when to call it are Xspace's to decide; the
         server ignores them from a creator anyway. */
      const keys = ['phone', 'email', 'source', 'budget', 'preferredArea', 'propertyType', 'propertySubtype', 'configuration', 'timeline', 'sourceMediaId'];
      if (internal) keys.push('temperature', 'followUpAt');
      for (const k of keys) {
        if (form[k] && String(form[k]).trim()) payload[k] = String(form[k]).trim();
      }
      if (payload.followUpAt) payload.followUpAt = new Date(payload.followUpAt).toISOString();
      await api.leads.create(payload);
      setForm(EMPTY_FORM);
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(err.message || 'Could not add this client');
    } finally {
      setBusy(false);
    }
  }

  const configKind = configKindFor(form.propertyType);

  /* Rows arrive straight from the API, in snake_case. */
  function requirementOf(c) {
    const bits = [
      c.configuration,
      propertyFullLabel(c.property_type, c.property_subtype),
      c.preferred_area,
      c.budget,
    ].filter(Boolean);
    return bits.length ? bits.join(' • ') : '—';
  }

  return (
    <div className="page-clients">
      <div className="container">
        <div className="top-bar">
          <div>
            <h1>{internal ? 'CRM' : 'My Leads'}</h1>
            <p className="subtitle">
              {internal
                ? 'Every client from first contact to referral. Open one for the full journey.'
                : 'Leads you generated, and how far each has got. Xspace takes it from here.'}
            </p>
          </div>

          <div className="top-bar-actions">
            <input
              className="crm-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={internal ? 'Search name, phone, email, area…' : 'Search your leads…'}
              aria-label="Search clients"
            />
            <button className="primary-btn" onClick={() => { setFormOpen((o) => !o); setFormError(''); }}>
              {formOpen ? 'Cancel' : internal ? '+ Add Client' : '+ Submit Lead'}
            </button>
          </div>
        </div>

        <div className="crm-tabs" role="tablist" aria-label="Filter by status">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={filter === t.key}
              className={'crm-tab' + (filter === t.key ? ' on' : '')}
              onClick={() => setFilter(t.key)}
            >
              {t.label}
              <span className="crm-tab-count">{counts[t.key] || 0}</span>
            </button>
          ))}
          {internal && (
            <button
              type="button"
              aria-pressed={matchedOnly}
              className={'crm-tab crm-match-toggle' + (matchedOnly ? ' on' : '')}
              onClick={() => setMatchedOnly((m) => !m)}
              title="Clients whose requirement fits a project we have"
            >
              🏠 We have a match
              <span className="crm-tab-count">{matchedCount}</span>
            </button>
          )}
        </div>

        {error && <div className="crm-error">{error}</div>}

        {formOpen && (
          <form className="add-client" onSubmit={addClient} autoComplete="off">
            <h3>{internal ? 'New client' : 'Submit a lead'}</h3>
            {!internal && (
              <p className="subtitle form-note">
                Xspace contacts the client and runs everything from here. You will see their status on this page.
              </p>
            )}
            <div className="add-grid">
              <label>
                <span>Name</span>
                <input value={form.name} onChange={set('name')} placeholder="Full name" required />
              </label>
              <label>
                <span>Phone</span>
                <input value={form.phone} onChange={set('phone')} placeholder="10-digit number" />
              </label>
              <label>
                <span>Email (optional)</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  placeholder="Outreach and visit emails go here"
                />
              </label>
              <label>
                <span>Source</span>
                <select value={form.source} onChange={set('source')}>
                  {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              {internal && (
                <label>
                  <span>Temperature</span>
                  <select value={form.temperature} onChange={set('temperature')}>
                    <option value="hot">🔥 Hot</option>
                    <option value="warm">🌤️ Warm</option>
                    <option value="cold">❄️ Cold</option>
                  </select>
                </label>
              )}

              <label>
                <span>Budget</span>
                <input value={form.budget} onChange={set('budget')} placeholder="₹70 – 90 Lakhs" />
              </label>
              <label>
                <span>Preferred area</span>
                <input value={form.preferredArea} onChange={set('preferredArea')} placeholder="Kukatpally / Hitech City" />
              </label>

              <label>
                <span>Property type</span>
                <select value={form.propertyType} onChange={set('propertyType')}>
                  <option value="">Select…</option>
                  {PROPERTY_TYPES.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </label>

              {subtypesFor(form.propertyType).length > 0 && (
                <label>
                  <span>Sub-type</span>
                  <select value={form.propertySubtype} onChange={set('propertySubtype')}>
                    <option value="">Select…</option>
                    {subtypesFor(form.propertyType).map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </label>
              )}

              {/* Bedrooms for a home, acres for land, square feet for a shop. */}
              <label>
                <span>{configLabelFor(form.propertyType)}</span>
                {configKind === 'bhk' ? (
                  <select value={form.configuration} onChange={set('configuration')}>
                    <option value="">Select…</option>
                    {BHK_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                ) : (
                  <input
                    value={form.configuration}
                    onChange={set('configuration')}
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
                <input value={form.timeline} onChange={set('timeline')} placeholder="Immediate (30 days)" />
              </label>

              {internal && (
                <label>
                  <span>Next follow-up</span>
                  <input type="datetime-local" value={form.followUpAt} onChange={set('followUpAt')} />
                </label>
              )}

              {myContent.length > 0 && (
                <label>
                  <span>Came from your content</span>
                  <select value={form.sourceMediaId} onChange={set('sourceMediaId')}>
                    <option value="">Not from my content</option>
                    {myContent.map((m) => (
                      <option key={m.id} value={m.id}>{m.title}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {formError && <div className="crm-error">{formError}</div>}

            <div className="add-actions">
              <button className="primary-btn" type="submit" disabled={busy}>
                {busy ? 'Adding…' : internal ? 'Add client' : 'Submit lead'}
              </button>
              <span className="subtitle">New clients start at “New” in the pipeline.</span>
            </div>
          </form>
        )}

        {loading ? (
          <p className="subtitle">Loading clients…</p>
        ) : visible.length === 0 ? (
          <p className="subtitle">
            {leads.length === 0
              ? internal
                ? 'No clients yet. Use “Add Client” to create the first one.'
                : 'No leads yet. Use “Submit Lead” to hand one to Xspace.'
              : 'No clients match this search or filter.'}
          </p>
        ) : internal ? (
          <div className="crm-table-wrap">
            <table className="stack-table crm-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Lead Source</th>
                  <th>Lead Owner</th>
                  <th>Budget</th>
                  <th>Preferred Area</th>
                  <th>Property Type</th>
                  <th>Status</th>
                  <th>Temperature</th>
                  <th>Last Activity</th>
                  <th>Next Follow-up</th>
                  {canDelete && <th aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} onClick={() => navigate('/clients/' + c.id)}>
                    <td>
                      {c.name}
                      {c.source_media_title && <span className="source">from “{c.source_media_title}”</span>}
                      {c.matching_projects?.length > 0 && (
                        <span
                          className="match-badge"
                          title={c.matching_projects.map((p) => `${p.name} (${p.matched.join(', ')})`).join('\n')}
                        >
                          🏠 We have this: {c.matching_projects[0].name} · {c.matching_projects[0].matched.join(', ')}
                          {c.matching_projects.length > 1 && ` +${c.matching_projects.length - 1} more`}
                        </span>
                      )}
                    </td>
                    <td data-label="Phone">{c.phone || '—'}</td>
                    <td data-label="Email" className="crm-email">{c.email || '—'}</td>
                    <td data-label="Lead Source">{c.source || '—'}</td>
                    <td data-label="Lead Owner">
                      {c.assigned_to_name || <span className="unowned">Unassigned</span>}
                    </td>
                    <td data-label="Budget">{c.budget || '—'}</td>
                    <td data-label="Preferred Area">{c.preferred_area || '—'}</td>
                    <td data-label="Property Type">
                      {[propertyFullLabel(c.property_type, c.property_subtype), c.configuration].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td data-label="Status"><span className="status">{c.status}</span></td>
                    <td data-label="Temperature">
                      <span className={'temp ' + c.temperature}>{TEMP_LABELS[c.temperature] || '—'}</span>
                    </td>
                    <td data-label="Last Activity" className="stamp">{timeAgo(c.last_activity_at || c.created_at)}</td>
                    <td data-label="Next Follow-up" className="stamp">{followUpCell(c.follow_up_at)}</td>
                    {canDelete && (
                      <td>
                        <button
                          className="delete-btn"
                          disabled={deleting === c.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeClient(c);
                          }}
                        >
                          {deleting === c.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <table className="stack-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>From</th>
                <th>Requirement</th>
                <th>Added</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} onClick={() => navigate('/clients/' + c.id)}>
                  <td>{c.name}</td>
                  <td data-label="From">
                    {c.source_media_title ? `“${c.source_media_title}”` : c.source || '—'}
                    {c.listing_title && <span className="source">Project: {c.listing_title}</span>}
                  </td>
                  <td data-label="Requirement">{requirementOf(c)}</td>
                  <td data-label="Added" className="stamp">
                    <div>
                      {c.created_at ? STAMP.format(new Date(c.created_at)) : '—'}
                      <span className="source">{timeAgo(c.created_at)}</span>
                    </div>
                  </td>
                  <td data-label="Status"><span className="status">{c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
