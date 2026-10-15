import { useState } from 'react';
import { timeAgo } from '../../../lib/time';
import api from '../../../lib/api';
import { useDashboard } from '../DashboardStore';

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
          <option value="corrections">With realtor for corrections</option>
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
                      {v.type} • {v.status === 'corrections' ? 'with realtor for corrections' : v.status}
                    </div>
                  </div>
                  <div className="ver-meta">
                    {proj.builder ? `${proj.builder} • ${proj.rera || 'No RERA'}` : ''}
                    <span style={{ marginLeft: 8 }}>{v.notes || ''}</span>
                  </div>
                </div>
                <div className="stack-end">
                  <div style={{ display: 'flex', gap: 8 }}>
                    {!['inprogress', 'verified', 'corrections'].includes(v.status) && (
                      <button
                        className="btn"
                        disabled={busy === v.id}
                        onClick={() => run(v.id, () => api.verifications.start(v.id))}
                      >
                        Start Verification
                      </button>
                    )}
                    {/* Back to the realtor; their next save puts it back in this queue. */}
                    {v.listingId && ['pending', 'inprogress', 'escalated'].includes(v.status) && (
                      <button
                        className="btn-ghost"
                        disabled={busy === v.id}
                        onClick={() => {
                          const notes = window.prompt('What does the realtor need to correct? They see this note in their notifications.');
                          if (notes && notes.trim()) {
                            run(v.id, () => api.verifications.requestCorrections(v.id, notes.trim()));
                          }
                        }}
                      >
                        Send back
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
