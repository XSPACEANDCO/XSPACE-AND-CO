import { useState } from 'react';
import { timeAgo } from '../../../lib/time';
import api from '../../../lib/api';
import { useDashboard } from '../DashboardStore';

/* ---------- Daily Snapshot ----------
   Cards arrive ready-made from /dashboard/snapshot, counted in SQL and
   already scoped to the signed-in role. */
export function DailySnapshot({ cards }) {
  return (
    <section className="kpi-strip">
      {cards.map((c) => (
        <div className="kpi" key={c.title}>
          <h3>{c.title}</h3>
          <div className="num">{c.num}</div>
        </div>
      ))}
    </section>
  );
}

/* ---------- Approvals (founder) ----------
   Approval requests arrive as notifications of type 'approval'. Deciding one
   marks it read on the server, so it stays decided after a refresh — it used
   to only change local state and reappear on the next load. */
export function ApprovalsPanel() {
  const { notifications, refresh } = useDashboard();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const items = notifications.filter((n) => n.type === 'approval' && !n.read);

  async function decide(id) {
    setError('');
    setBusy(id);
    try {
      await api.dashboard.markRead(id);
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not record that decision');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel">
      <h4>Approvals</h4>
      <div className="muted small">Items waiting for approval (Founder-only or escalations)</div>
      {error && <div className="people-error">{error}</div>}
      <div className="approvals-list">
        {items.length === 0 ? (
          <div className="small muted">No approvals pending.</div>
        ) : (
          items.map((it) => (
            <div className="approval" key={it.id}>
              <div>
                <strong>{it.title}</strong>
                <div className="meta">{it.body}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" disabled={busy === it.id} onClick={() => decide(it.id)}>
                  Approve
                </button>
                <button className="btn-ghost" disabled={busy === it.id} onClick={() => decide(it.id)}>
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/* ---------- Activity Feed ---------- */
export function ActivityPanel() {
  const { activity } = useDashboard();

  return (
    <section className="panel">
      <h4>Recent Activity</h4>
      <div className="muted small">Recent actions from your team</div>
      <div className="activity">
        {activity.length === 0 ? (
          <div className="small muted">No recent activity</div>
        ) : (
          activity.map((a) => (
            <div className="activity-item" key={a.id}>
              <div className="activity-avatar-col">
                <div className="activity-avatar" />
              </div>
              <div>
                <div style={{ fontSize: 13 }}>
                  <strong>{a.text}</strong>
                </div>
                <div className="small muted">
                  {a.actorName ? `${a.actorName} • ` : ''}
                  {timeAgo(a.createdAt)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/* ---------- Verification Queue (core / founder) ----------
   Every button here calls the API and re-reads the queue, so two people
   working the list see the same state. */
export function VerificationPanel() {
  const { verifications, listings, projects, refresh } = useDashboard();
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const items =
    filter === 'all' ? verifications : verifications.filter((v) => v.status === filter);

  async function run(id, fn) {
    setError('');
    setBusy(id);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err.message || 'That action failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel">
      <h4>Verification Queue</h4>
      <div className="muted small">Project / Legal / Listing verifications — Core Team workload</div>
      {error && <div className="people-error">{error}</div>}

      <div className="ver-toolbar">
        <label className="small">Filter:</label>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="inprogress">In Progress</option>
          <option value="escalated">Escalated</option>
          <option value="verified">Verified</option>
        </select>
        <div className="push" style={{ display: 'flex', gap: 8 }}>
          <a className="btn-ghost" href={api.verifications.csvUrl()}>Export CSV</a>
        </div>
      </div>

      <div className="list-gap">
        {items.length === 0 ? (
          <div className="small muted">No verifications match this filter.</div>
        ) : (
          items.map((v) => {
            const listing = listings.find((l) => l.id === v.listingId) || {};
            const proj = projects.find((p) => p.id === v.projectId) || {};
            return (
              <div className="ver-row" key={v.id}>
                <div className="grow">
                  <div className="ver-head">
                    <div>
                      <strong>{listing.title || proj.name || 'Verification ' + v.id}</strong>
                    </div>
                    <div className="small muted">
                      {v.type} • {v.status}
                    </div>
                  </div>
                  <div className="ver-meta">
                    {proj.builder ? `${proj.builder} • ${proj.rera || 'No RERA'}` : ''}
                    <span style={{ marginLeft: 8 }}>{v.notes || ''}</span>
                  </div>
                </div>
                <div className="stack-end">
                  <div style={{ display: 'flex', gap: 8 }}>
                    {v.status !== 'inprogress' && v.status !== 'verified' && (
                      <button
                        className="btn"
                        disabled={busy === v.id}
                        onClick={() => run(v.id, () => api.verifications.start(v.id))}
                      >
                        Start Verification
                      </button>
                    )}
                    {v.status === 'inprogress' && (
                      <button
                        className="btn"
                        disabled={busy === v.id}
                        onClick={() => run(v.id, () => api.verifications.verify(v.id))}
                      >
                        Mark Verified
                      </button>
                    )}
                    {v.status !== 'escalated' && v.status !== 'verified' && (
                      <button
                        className="btn-ghost"
                        disabled={busy === v.id}
                        onClick={() =>
                          run(v.id, () => api.verifications.escalate(v.id, 'Escalated from dashboard'))
                        }
                      >
                        Escalate to Legal
                      </button>
                    )}
                  </div>
                  <div className="small muted">Created: {timeAgo(v.createdAt)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

/* ---------- Leads Awaiting Legal Go-Ahead ----------
   Leads whose listing has not been verified yet: a site visit on an
   unverified listing is the thing this is meant to catch. */
export function LeadsLegalPanel() {
  const { leads, listings } = useDashboard();

  const awaiting = leads.filter((l) => {
    if (!l.listingId) return false;
    const listing = listings.find((li) => li.id === l.listingId);
    return listing && !listing.verified;
  });

  return (
    <section className="panel">
      <h4>Leads Awaiting Legal Go-Ahead</h4>
      <div className="muted small">Leads whose listing is not verified yet</div>
      <div style={{ marginTop: 10 }}>
        {awaiting.length === 0 ? (
          <div className="small muted">No leads awaiting legal go-ahead.</div>
        ) : (
          awaiting.map((ld) => {
            const listing = listings.find((li) => li.id === ld.listingId) || {};
            return (
              <div className="ver-row" key={ld.id}>
                <div className="grow">
                  <strong>{ld.name}</strong>
                  <div className="small muted">
                    {ld.source || 'Unknown source'} • {ld.budget || 'No budget'} • {listing.title || ''}
                  </div>
                </div>
                <div className="stack-end">
                  <div className="small muted">Verify the listing to clear this</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
