import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { timeAgo } from '../lib/time';
import { RULES_VERSION } from '../lib/rules';
import { Chip, Empty, KpiRow, Section, compact, percent, rupees } from './dashboard/partner/shared';
import './dashboard/partner/partner.css';

/* Partner Dashboards — every partner's numbers side by side, for Founder and
   Core.

   The figures are the ones each partner sees on their own dashboard, counted
   server-side (routes/users.js /partner-dashboards), so a conversation about
   "your numbers" is about the same numbers on both sides. Each row also
   flags what needs a nudge: overdue follow-ups or work, KYC not done, rules
   not acknowledged, or nobody seen in a week. */

const WEEK = 7 * 24 * 60 * 60 * 1000;

/* Per role: the columns of its table, and the totals strip above it.
   A column is [key, label, format?]. */
const VIEWS = {
  realtor: {
    label: '🏠 Realtor Partners',
    columns: [
      ['leads', 'Leads'],
      ['qualified', 'Qualified'],
      ['visits_completed', 'Visits'],
      ['deals', 'Deals'],
      ['conversion', 'Conversion', (v) => `${v}%`],
      ['listings', 'Listings', (v, r) => `${v} (${r.listings_verified} ✓)`],
      ['followups_overdue', 'Overdue F/U'],
      ['area_updates_30d', 'Area updates (30d)'],
    ],
    totals: (rows) => [
      { icon: '🔥', label: 'Leads', value: sum(rows, 'leads') },
      { icon: '🎯', label: 'Qualified', value: sum(rows, 'qualified') },
      { icon: '📅', label: 'Visits Done', value: sum(rows, 'visits_completed'), hint: `${sum(rows, 'visits_upcoming')} upcoming` },
      { icon: '🤝', label: 'Deals', value: sum(rows, 'deals'), hint: `${percent(sum(rows, 'deals'), sum(rows, 'leads'))} conversion` },
      { icon: '📞', label: 'Overdue Follow-ups', value: sum(rows, 'followups_overdue') },
    ],
  },
  creator: {
    label: '🎥 Creator Partners',
    columns: [
      ['content_published', 'Published', (v, r) => `${v} / ${r.content_submitted}`],
      ['reach', 'Reach', (v) => compact(Number(v))],
      ['leads', 'Leads'],
      ['leads_from_content', 'From content'],
      ['qualified', 'Qualified'],
      ['deals', 'Deals'],
      ['conversion', 'Conversion', (v) => `${v}%`],
    ],
    totals: (rows) => [
      { icon: '🎬', label: 'Published', value: sum(rows, 'content_published'), hint: `${sum(rows, 'content_submitted')} submitted` },
      { icon: '👀', label: 'Reach', value: compact(sum(rows, 'reach')) },
      { icon: '🔥', label: 'Leads', value: sum(rows, 'leads'), hint: `${sum(rows, 'leads_from_content')} credited to content` },
      { icon: '🎯', label: 'Qualified', value: sum(rows, 'qualified') },
      { icon: '🤝', label: 'Deals', value: sum(rows, 'deals') },
    ],
  },
  studio: {
    label: '🎬 Xspace Studio',
    columns: [
      ['in_production', 'In production'],
      ['awaiting_approval', 'Awaiting approval'],
      ['revisions', 'Revisions'],
      ['approved_30d', 'Approved (30d)'],
      ['overdue', 'Overdue'],
    ],
    totals: (rows) => [
      { icon: '🎬', label: 'In Production', value: sum(rows, 'in_production') },
      { icon: '🟣', label: 'Awaiting Approval', value: sum(rows, 'awaiting_approval') },
      { icon: '🔄', label: 'Revisions', value: sum(rows, 'revisions') },
      { icon: '✅', label: 'Approved (30d)', value: sum(rows, 'approved_30d') },
      { icon: '⏰', label: 'Overdue', value: sum(rows, 'overdue') },
    ],
  },
};

function sum(rows, key) {
  return rows.reduce((n, r) => n + Number(r[key] || 0), 0);
}

/* What this partner needs a nudge about, most serious first. */
function flagsFor(p) {
  const out = [];
  if (!p.active) return [{ tone: 'grey', label: 'Deactivated' }];
  if (p.followups_overdue) out.push({ tone: 'red', label: `${p.followups_overdue} overdue follow-up${p.followups_overdue > 1 ? 's' : ''}` });
  if (p.role === 'studio' && p.overdue) out.push({ tone: 'red', label: `${p.overdue} overdue` });
  if (p.kyc_status !== 'verified') {
    out.push({
      tone: 'amber',
      label: !p.kyc_submitted_at ? 'KYC not submitted' : p.kyc_status === 'rejected' ? 'KYC sent back' : 'KYC to review',
    });
  }
  if (!p.rules_ack_at || new Date(p.rules_ack_at) < new Date(RULES_VERSION)) {
    out.push({ tone: 'amber', label: 'Rules not acknowledged' });
  }
  if (!p.last_seen_at || Date.now() - new Date(p.last_seen_at).getTime() > WEEK) {
    out.push({ tone: 'grey', label: p.last_seen_at ? 'Inactive 7+ days' : 'Never signed in' });
  }
  return out;
}

function subtitleFor(p) {
  if (p.role === 'realtor') return p.areas || 'No areas set';
  if (p.role === 'creator') return [p.platform, p.handle].filter(Boolean).join(' · ') || 'No handle set';
  return p.skill || 'Studio';
}

export default function PartnerDashboards() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('realtor');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: null, dir: 'desc' });
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    api.users
      .partnerDashboards()
      .then((out) =>
        setRows(
          (out.dashboards || []).map((r) => ({
            ...r,
            conversion: r.leads ? Math.round((r.deals / r.leads) * 1000) / 10 : 0,
          }))
        )
      )
      .catch((err) => setError(err.message || 'Could not load partner dashboards'))
      .finally(() => setLoading(false));
  }, []);

  const view = VIEWS[tab];
  const ofRole = useMemo(() => rows.filter((r) => r.role === tab), [rows, tab]);
  const live = ofRole.filter((r) => r.active);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = ofRole.filter((r) => showInactive || r.active);
    if (needle) out = out.filter((r) => `${r.name} ${subtitleFor(r)}`.toLowerCase().includes(needle));
    if (attentionOnly) out = out.filter((r) => flagsFor(r).some((f) => f.tone !== 'grey'));
    if (sort.key) {
      const k = sort.key;
      out = [...out].sort((a, b) =>
        k === 'name'
          ? a.name.localeCompare(b.name) * (sort.dir === 'asc' ? 1 : -1)
          : (Number(a[k] || 0) - Number(b[k] || 0)) * (sort.dir === 'asc' ? 1 : -1)
      );
    }
    return out;
  }, [ofRole, q, attentionOnly, showInactive, sort]);

  function sortBy(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  }

  const arrow = (key) => (sort.key === key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : '');

  /* The top performer on the role's headline figure. */
  const headline = { realtor: 'deals', creator: 'leads', studio: 'approved_30d' }[tab];
  const leader = [...live].sort((a, b) => Number(b[headline] || 0) - Number(a[headline] || 0))[0];

  return (
    <div className="pd">
      <header className="pd-hero">
        <h1>Partner Dashboards</h1>
        <p>Every partner&apos;s numbers side by side — the same figures they see on their own dashboard.</p>
      </header>

      <div className="pd-actions">
        <div className="pd-actions-row">
          {Object.entries(VIEWS).map(([k, v]) => (
            <button
              key={k}
              className={tab === k ? 'btn' : 'btn-ghost'}
              onClick={() => { setTab(k); setSort({ key: null, dir: 'desc' }); }}
            >
              {v.label} ({rows.filter((r) => r.role === k && r.active).length})
            </button>
          ))}
        </div>
      </div>

      {error && <div className="pd-error">{error}</div>}

      <KpiRow items={view.totals(live)} />

      <Section
        title={view.label}
        subtitle={
          leader && Number(leader[headline]) > 0
            ? `Leading on ${headline === 'approved_30d' ? 'approved work this month' : headline}: ${leader.name}`
            : 'Click a column to sort'
        }
      >
        <div className="au-filters">
          <input
            className="pd-input pdb-search"
            placeholder="Search by name or area"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search partners"
          />
          <label className="pdb-toggle">
            <input type="checkbox" checked={attentionOnly} onChange={(e) => setAttentionOnly(e.target.checked)} />
            Needs attention only
          </label>
          {/* The column headers are the sort control; on a phone the table
              becomes cards with no headers, so the same choice is a select. */}
          <select
            className="pd-input pdb-sort-select"
            aria-label="Sort partners"
            value={sort.key ? `${sort.key}:${sort.dir}` : ''}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(':');
              setSort(key ? { key, dir } : { key: null, dir: 'desc' });
            }}
          >
            <option value="">Sort: default</option>
            <option value="name:asc">Name A–Z</option>
            {view.columns.map(([key, label]) => (
              <option key={key} value={`${key}:desc`}>{label} — highest first</option>
            ))}
          </select>
          <label className="pdb-toggle">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show deactivated
          </label>
        </div>

        {loading ? (
          <Empty>Loading…</Empty>
        ) : visible.length === 0 ? (
          <Empty>{ofRole.length === 0 ? 'No partners in this group yet. Add them from Teams.' : 'Nobody matches.'}</Empty>
        ) : (
          <div className="pd-table-wrap">
            <table className="pd-table pdb-table stack-table">
              <thead>
                <tr>
                  <th>
                    <button className="pdb-sort" onClick={() => sortBy('name')}>Partner{arrow('name')}</button>
                  </th>
                  {view.columns.map(([key, label]) => (
                    <th key={key}>
                      <button className="pdb-sort" onClick={() => sortBy(key)}>{label}{arrow(key)}</button>
                    </th>
                  ))}
                  <th>Commission</th>
                  <th className="pdb-flags-col">Needs attention</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const flags = flagsFor(p);
                  return (
                    <tr key={p.id} className={p.active ? '' : 'pdb-inactive'}>
                      <td>
                        <div className="pdb-name">
                          <span className={`pdb-presence ${p.presence}`} title={p.presence} />
                          <strong>{p.name}</strong>
                        </div>
                        <div className="small muted">{subtitleFor(p)}</div>
                        <div className="small muted">
                          {p.last_seen_at ? `Seen ${timeAgo(p.last_seen_at)}` : 'Never signed in'}
                        </div>
                      </td>
                      {view.columns.map(([key, label, fmt]) => (
                        <td key={key} data-label={label} className={key.includes('overdue') && Number(p[key]) > 0 ? 'pdb-bad' : ''}>
                          {fmt ? fmt(p[key], p) : p[key]}
                        </td>
                      ))}
                      <td data-label="Commission">
                        <div>
                          <div>{rupees(p.commission_due)} due</div>
                          <div className="small muted">{rupees(p.commission_paid)} paid</div>
                        </div>
                      </td>
                      <td className="pdb-flags-col">
                        {flags.length === 0 ? (
                          <Chip tone="green">✓ All good</Chip>
                        ) : (
                          <div className="pdb-flags">
                            {flags.map((f) => <Chip key={f.label} tone={f.tone}>{f.label}</Chip>)}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
