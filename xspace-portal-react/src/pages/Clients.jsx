import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { timeAgo } from '../lib/time';
import api from '../lib/api';
import {
  ALL_STATUSES, BHK_OPTIONS, PROPERTY_TYPES, TEMP_LABELS,
  configKindFor, configLabelFor, propertyLabel,
} from '../lib/leadStatus';
import './clients.css';

/* The CRM list, from the database.

   Which rows arrive is the server's decision: Founder and Core get every
   lead, a partner gets only the ones assigned to or sourced by them. There is
   no client-side filtering by owner here, because there is nothing to
   filter — the rows that would need hiding never leave the server. */

const STAMP = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const EMPTY_FORM = {
  name: '', phone: '', source: 'Instagram', temperature: 'warm',
  budget: '', preferredArea: '', propertyType: '', configuration: '', timeline: '',
};

const SOURCES = ['Instagram', 'Referral', 'Website', 'Walk-in', 'YouTube', 'Other'];

export default function Clients() {
  const navigate = useNavigate();

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

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

  const visible = useMemo(
    () => (filter === 'all' ? leads : leads.filter((c) => c.status === filter)),
    [leads, filter]
  );

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => {
      /* Switching property type changes what configuration even means, so the
         previous answer (say "3 BHK" on a plot of land) must not survive. */
      if (key === 'propertyType') return { ...f, propertyType: value, configuration: '' };
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
      for (const k of ['phone', 'source', 'temperature', 'budget', 'preferredArea', 'propertyType', 'configuration', 'timeline']) {
        if (form[k] && String(form[k]).trim()) payload[k] = String(form[k]).trim();
      }
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

  function requirementOf(c) {
    const bits = [
      c.configuration,
      propertyLabel(c.propertyType),
      c.preferredArea,
      c.budget,
    ].filter(Boolean);
    return bits.length ? bits.join(' • ') : '—';
  }

  return (
    <div className="page-clients">
      <div className="container">
        <div className="top-bar">
          <div>
            <h1>Clients</h1>
            <p className="subtitle">Click on a client to view complete details</p>
          </div>

          <div className="top-bar-actions">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All Clients</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button className="primary-btn" onClick={() => { setFormOpen((o) => !o); setFormError(''); }}>
              {formOpen ? 'Cancel' : '+ Add Client'}
            </button>
          </div>
        </div>

        {error && <div className="crm-error">{error}</div>}

        {formOpen && (
          <form className="add-client" onSubmit={addClient} autoComplete="off">
            <h3>New client</h3>
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
                <span>Source</span>
                <select value={form.source} onChange={set('source')}>
                  {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label>
                <span>Temperature</span>
                <select value={form.temperature} onChange={set('temperature')}>
                  <option value="hot">🔥 Hot</option>
                  <option value="warm">🌤️ Warm</option>
                  <option value="cold">❄️ Cold</option>
                </select>
              </label>

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
            </div>

            {formError && <div className="crm-error">{formError}</div>}

            <div className="add-actions">
              <button className="primary-btn" type="submit" disabled={busy}>
                {busy ? 'Adding…' : 'Add client'}
              </button>
              <span className="subtitle">New clients start at “New” in the pipeline.</span>
            </div>
          </form>
        )}

        {loading ? (
          <p className="subtitle">Loading clients…</p>
        ) : visible.length === 0 ? (
          <p className="subtitle">
            {leads.length === 0 ? 'No clients yet. Use “Add Client” to create the first one.' : 'No clients match this filter.'}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Requirement</th>
                <th>Added</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} onClick={() => navigate('/clients/' + c.id)}>
                  <td>
                    {c.name}
                    <span className={'temp ' + c.temperature}>{TEMP_LABELS[c.temperature] || ''}</span>
                    <span className="source">{c.source || '—'}</span>
                  </td>
                  <td>{c.phone || '—'}</td>
                  <td>{requirementOf(c)}</td>
                  <td className="stamp">
                    {c.created_at ? STAMP.format(new Date(c.created_at)) : '—'}
                    <span className="source">{timeAgo(c.created_at)}</span>
                  </td>
                  <td>
                    <span className="status">{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
