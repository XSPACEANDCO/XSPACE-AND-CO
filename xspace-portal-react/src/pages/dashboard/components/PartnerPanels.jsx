import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../lib/api';
import { FUNNEL_BUCKETS } from '../../../lib/leadStatus';
import { useDashboard } from '../DashboardStore';

/* Five funnel columns over a longer pipeline — see lib/leadStatus.js. */

/* ---------- Creator partner dashboard ----------
   Their own uploaded leads and the media they have handed to Studio. Both
   datasets arrive already scoped to them by the server. */
export function CreatorPanel() {
  const { leads, media } = useDashboard();
  const navigate = useNavigate();

  const converted = leads.filter((l) => l.status === 'Closed').length;

  return (
    <section className="panel agent-panel">
      <h4>Creator Partner Dashboard</h4>
      <div className="muted small">Your uploaded leads and the media you have sent to Studio</div>

      <div className="kpi-grid">
        <div className="kpi"><h3>Leads Uploaded</h3><div className="num">{leads.length}</div></div>
        <div className="kpi"><h3>Converted</h3><div className="num">{converted}</div></div>
        <div className="kpi">
          <h3>Conversion Rate</h3>
          <div className="num">{leads.length ? Math.round((converted / leads.length) * 100) : 0}%</div>
        </div>
        <div className="kpi"><h3>Media Submitted</h3><div className="num">{media.length}</div></div>
      </div>

      <div className="subsection">
        <h4>Your Leads</h4>
        <div className="muted small">Only leads you sourced — you cannot see other partners&apos; leads</div>
        <div className="pipeline">
          {FUNNEL_BUCKETS.map(({ stage, statuses }) => {
            const items = leads.filter((l) => statuses.includes(l.status));
            return (
              <div className="pipeline-column" key={stage}>
                <h5>{stage} ({items.length})</h5>
                {items.map((it) => (
                  <div className="pipeline-card" key={it.id}>
                    <strong>{it.name}</strong>
                    <div className="small muted">{it.source || '—'} • {it.budget || '—'}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="subsection">
        <h4>Raw Media — Editing Status</h4>
        <div className="muted small">What Studio is doing with the reels and shorts you uploaded</div>
        <div style={{ marginTop: 8 }}>
          {media.length === 0 ? (
            <div className="small muted">You have not uploaded any media yet.</div>
          ) : (
            media.map((m) => (
              <div className="ver-row" key={m.id}>
                <div className="grow">
                  <strong>{m.title || m.kind || 'Media item'}</strong>
                  <div className="small muted">Submitted by you</div>
                </div>
                <div className="stack-end">
                  <div className="small muted">{m.status}</div>
                </div>
              </div>
            ))
          )}
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => navigate('/media-upload')}>Upload Raw Media</button>{' '}
          <button className="btn-ghost" onClick={() => navigate('/lead-uploads')}>Upload Lead</button>
        </div>
      </div>
    </section>
  );
}

/* ---------- Xspace Studio work queue ---------- */
export function StudioWorkPanel() {
  const { media, projects, refresh } = useDashboard();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const pending = media.filter((m) => m.status === 'pending');
  const inProgress = media.filter((m) => m.status === 'in_progress');
  const delivered = media.filter((m) => m.status === 'delivered');

  async function advance(item) {
    const next = item.status === 'pending' ? 'in_progress' : 'delivered';
    setError('');
    setBusy(item.id);
    try {
      await api.media.setStatus(item.id, next);
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not update that item');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel agent-panel">
      <h4>Studio Work Queue</h4>
      <div className="muted small">Raw reels and video from creator and realtor partners</div>
      {error && <div className="people-error">{error}</div>}

      <div className="kpi-grid">
        <div className="kpi"><h3>Pending</h3><div className="num">{pending.length}</div></div>
        <div className="kpi"><h3>In Progress</h3><div className="num">{inProgress.length}</div></div>
        <div className="kpi"><h3>Delivered</h3><div className="num">{delivered.length}</div></div>
        <div className="kpi"><h3>Projects Accessible</h3><div className="num">{projects.length}</div></div>
      </div>

      <div className="subsection">
        <h4>Pending Works</h4>
        <div style={{ marginTop: 8 }}>
          {media.length === 0 ? (
            <div className="small muted">Nothing in the queue.</div>
          ) : (
            media.map((m) => (
              <div className="ver-row" key={m.id}>
                <div className="grow">
                  <strong>{m.title || m.kind || 'Media item'}</strong>
                  <div className="small muted">{m.status}</div>
                </div>
                <div className="stack-end">
                  {m.status !== 'delivered' && (
                    <button className="btn" disabled={busy === m.id} onClick={() => advance(m)}>
                      {m.status === 'pending' ? 'Start Edit' : 'Mark Delivered'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="btn-ghost" onClick={() => navigate('/raw-media')}>Raw Media Inbox</button>{' '}
          <button className="btn-ghost" onClick={() => navigate('/media-library')}>Media Library</button>
        </div>
      </div>
    </section>
  );
}
