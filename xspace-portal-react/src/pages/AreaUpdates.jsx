import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { timeAgo } from '../lib/time';
import { seesEverything } from '../lib/roleConfig';
import { useDashboard } from './dashboard/DashboardStore';
import { Chip, Empty, Section } from './dashboard/partner/shared';
import './dashboard/partner/partner.css';

/* Area Updates — what is changing on the ground, area by area.

   A realtor partner covers a handful of micro-markets and hears things first:
   a builder about to launch, prices moving, a road being widened, a new GO.
   Posting it here turns one person's ear to the ground into something the
   whole company can act on. Partners see their own feed; Founder and Core
   see every partner's, filterable by area. */

export const AREA_CATEGORIES = {
  launch: { label: '🚀 New launch', tone: 'green' },
  price: { label: '💹 Price movement', tone: 'amber' },
  infrastructure: { label: '🛣️ Infrastructure', tone: 'blue' },
  inventory: { label: '🏘️ Inventory', tone: 'purple' },
  regulation: { label: '📜 Regulation / GO', tone: 'red' },
  market: { label: '🗣️ Market buzz', tone: 'grey' },
};

const EMPTY = { area: '', category: 'launch', note: '', link: '' };

export default function AreaUpdates() {
  const { role, currentUser } = useDashboard();
  const all = seesEverything(role);

  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [areaFilter, setAreaFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  /* The areas this partner covers, from their profile — offered as one-tap
     choices so the same place is not spelt three ways. */
  const myAreas = useMemo(
    () =>
      String(currentUser?.areas || '')
        .split(/[,\n]/)
        .map((a) => a.trim())
        .filter(Boolean),
    [currentUser]
  );

  const load = useCallback(async () => {
    setError('');
    try {
      const out = await api.dashboard.areaUpdates();
      setUpdates(out.updates || []);
    } catch (err) {
      setError(err.message || 'Could not load area updates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function post(e) {
    e.preventDefault();
    setError('');
    if (!form.area.trim()) return setError('Which area is this about?');
    if (!form.note.trim()) return setError('Write what is changing');
    setBusy(true);
    try {
      await api.dashboard.addAreaUpdate({
        area: form.area.trim(),
        category: form.category,
        note: form.note.trim(),
        link: form.link.trim() || null,
      });
      setForm({ ...EMPTY, area: form.area });
      await load();
    } catch (err) {
      setError(err.message || 'Could not post that update');
    } finally {
      setBusy(false);
    }
  }

  async function remove(u) {
    if (!window.confirm(`Delete this update about ${u.area}?`)) return;
    try {
      await api.dashboard.removeAreaUpdate(u.id);
      setUpdates((rows) => rows.filter((r) => r.id !== u.id));
    } catch (err) {
      setError(err.message || 'Could not delete that update');
    }
  }

  const areas = [...new Set(updates.map((u) => u.area))].sort((a, b) => a.localeCompare(b));
  const visible = updates.filter(
    (u) => (!areaFilter || u.area === areaFilter) && (!categoryFilter || u.category === categoryFilter)
  );

  /* Latest per area, for the at-a-glance strip. */
  const perArea = areas
    .map((a) => ({ area: a, count: updates.filter((u) => u.area === a).length, last: updates.find((u) => u.area === a) }))
    .sort((x, y) => new Date(y.last.created_at) - new Date(x.last.created_at))
    .slice(0, 8);

  return (
    <div className="pd">
      <header className="pd-hero">
        <h1>Area Updates</h1>
        <p>
          {all
            ? 'What partners are seeing on the ground, across every area.'
            : 'Keep your areas current — launches, prices, infrastructure and rule changes.'}
        </p>
      </header>

      {error && <div className="pd-error">{error}</div>}

      <div className="pd-grid">
        <div className="pd-col">
          <Section title="📰 Feed" subtitle={all ? 'Every partner, newest first' : 'Your updates, newest first'}>
            <div className="au-filters">
              <select className="pd-inline-select" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} aria-label="Filter by area">
                <option value="">All areas</option>
                {areas.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select className="pd-inline-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by type">
                <option value="">All types</option>
                {Object.entries(AREA_CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
              </select>
            </div>

            {loading ? (
              <Empty>Loading…</Empty>
            ) : visible.length === 0 ? (
              <Empty>
                {updates.length === 0
                  ? 'No updates yet. Post the first thing you have heard about your area.'
                  : 'Nothing matches these filters.'}
              </Empty>
            ) : (
              <div className="pd-list">
                {visible.map((u) => {
                  const cat = AREA_CATEGORIES[u.category] || AREA_CATEGORIES.market;
                  return (
                    <div className="pd-item" key={u.id}>
                      <div className="pd-item-main">
                        <div className="pd-item-title">📍 {u.area}</div>
                        <div className="au-note">{u.note}</div>
                        <div className="pd-item-meta">
                          {all && u.user_name ? `${u.user_name} • ` : ''}
                          {timeAgo(u.created_at)}
                          {u.link && (
                            <>
                              {' • '}
                              <a href={u.link} target="_blank" rel="noopener noreferrer" className="au-link">
                                Source ↗
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="pd-item-side">
                        <Chip tone={cat.tone}>{cat.label}</Chip>
                        {(all || u.user_id === currentUser?.id) && (
                          <button className="pd-link au-delete" onClick={() => remove(u)}>Delete</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        <aside className="pd-col">
          <Section title="✍️ Post an update">
            <form onSubmit={post} autoComplete="off">
              <div className="qt-form au-form">
                <label>
                  <span>Area</span>
                  <input
                    className="pd-input"
                    list="au-areas"
                    value={form.area}
                    onChange={set('area')}
                    placeholder="e.g. Kokapet"
                  />
                  <datalist id="au-areas">
                    {[...new Set([...myAreas, ...areas])].map((a) => <option key={a} value={a} />)}
                  </datalist>
                </label>
                <label>
                  <span>Type</span>
                  <select value={form.category} onChange={set('category')}>
                    {Object.entries(AREA_CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                  </select>
                </label>
                <label className="au-wide">
                  <span>What is changing?</span>
                  <textarea
                    className="pd-input"
                    rows={4}
                    value={form.note}
                    onChange={set('note')}
                    placeholder="e.g. Builder X launching a 30-floor tower near the ORR in March; pre-launch ₹7,800/sft"
                  />
                </label>
                <label className="au-wide">
                  <span>Source link (optional)</span>
                  <input className="pd-input" value={form.link} onChange={set('link')} placeholder="https://…" />
                </label>
              </div>
              {myAreas.length > 0 && (
                <div className="au-chips">
                  {myAreas.map((a) => (
                    <button type="button" key={a} className="btn-ghost" onClick={() => setForm({ ...form, area: a })}>
                      {a}
                    </button>
                  ))}
                </div>
              )}
              <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Posting…' : 'Post update'}
              </button>
            </form>
          </Section>

          <Section title="🗺️ Areas">
            {perArea.length === 0 ? (
              <Empty>Areas you post about appear here.</Empty>
            ) : (
              <div className="pd-list">
                {perArea.map((a) => (
                  <div className="pd-item" key={a.area}>
                    <div className="pd-item-main">
                      <button className="pd-link" onClick={() => setAreaFilter(a.area)}>{a.area}</button>
                      <div className="pd-item-meta">Last update {timeAgo(a.last.created_at)}</div>
                    </div>
                    <div className="pd-item-side">
                      <Chip tone="grey">{a.count}</Chip>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}
