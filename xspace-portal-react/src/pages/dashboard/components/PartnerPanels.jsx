import { useNavigate } from 'react-router-dom';
import { timeAgo } from '../../../lib/time';
import { groupByStage, leadsForRole } from '../../../lib/metrics';
import { useDashboard } from '../DashboardStore';

/* ---------- Creator partner dashboard ----------
   Lead uploads, their own lead tracker, and the status of raw media they have
   handed to Studio. */
export function CreatorPanel() {
  const { role, userId, leads, studio } = useDashboard();
  const navigate = useNavigate();

  const myLeads = leadsForRole(leads, role, userId);
  const stages = groupByStage(myLeads);
  const converted = myLeads.filter((l) => (l.status || '').toLowerCase() === 'closed').length;

  return (
    <section className="panel agent-panel">
      <h4>Creator Partner Dashboard</h4>
      <div className="muted small">Your uploaded leads and the media you have sent to Studio</div>

      <div className="kpi-grid">
        <div className="kpi"><h3>Leads Uploaded</h3><div className="num">{myLeads.length}</div></div>
        <div className="kpi"><h3>Converted</h3><div className="num">{converted}</div></div>
        <div className="kpi"><h3>Conversion Rate</h3><div className="num">{myLeads.length ? Math.round((converted / myLeads.length) * 100) : 0}%</div></div>
        <div className="kpi"><h3>Commission Pending</h3><div className="num">₹45,000</div></div>
      </div>

      <div className="subsection">
        <h4>Your Lead Tracker</h4>
        <div className="muted small">Only leads you sourced — you cannot see other partners&apos; leads</div>
        <div className="pipeline">
          {stages.map(({ stage, items }) => (
            <div className="pipeline-column" key={stage}>
              <h5>{stage} ({items.length})</h5>
              {items.map((it) => (
                <div className="pipeline-card" key={it.id}>
                  <strong>{it.name}</strong>
                  <div className="small muted">{it.source} • {it.budget}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="subsection">
        <h4>Raw Media — Editing Status</h4>
        <div className="muted small">What Studio is doing with the reels and shorts you uploaded</div>
        <div style={{ marginTop: 8 }}>
          {studio.map((s) => (
            <div className="ver-row" key={s.id}>
              <div className="grow">
                <strong>{s.title}</strong>
                <div className="small muted">Submitted by you</div>
              </div>
              <div className="stack-end">
                <div className="small muted">{s.status}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => navigate('/media-upload')}>Upload Raw Media</button>{' '}
          <button className="btn-ghost" onClick={() => navigate('/lead-uploads')}>Upload Lead</button>
        </div>
      </div>
    </section>
  );
}

/* ---------- Xspace Studio work queue ----------
   Raw media in, what is being edited, and what is still pending. */
export function StudioWorkPanel() {
  const { studio, projects, update, addAudit, currentUser } = useDashboard();
  const navigate = useNavigate();

  const pending = studio.filter((s) => s.status === 'Pending');
  const inProgress = studio.filter((s) => s.status === 'In Progress');

  function advance(item) {
    const next = item.status === 'Pending' ? 'In Progress' : 'Delivered';
    update('studio', (prev) => prev.map((s) => (s.id === item.id ? { ...s, status: next } : s)));
    addAudit(`Studio item "${item.title}" moved to ${next} by ${currentUser ? currentUser.name : 'studio'}`);
  }

  return (
    <section className="panel agent-panel">
      <h4>Studio Work Queue</h4>
      <div className="muted small">Raw reels and video from creator and realtor partners</div>

      <div className="kpi-grid">
        <div className="kpi"><h3>Pending</h3><div className="num">{pending.length}</div></div>
        <div className="kpi"><h3>In Progress</h3><div className="num">{inProgress.length}</div></div>
        <div className="kpi"><h3>Projects Accessible</h3><div className="num">{projects.length}</div></div>
        <div className="kpi"><h3>Media Library</h3><div className="num">24</div></div>
      </div>

      <div className="subsection">
        <h4>Pending Works</h4>
        <div style={{ marginTop: 8 }}>
          {studio.length === 0 ? (
            <div className="small muted">Nothing in the queue.</div>
          ) : (
            studio.map((s) => (
              <div className="ver-row" key={s.id}>
                <div className="grow">
                  <strong>{s.title}</strong>
                  <div className="small muted">{s.status}</div>
                </div>
                <div className="stack-end">
                  {s.status !== 'Delivered' && (
                    <button className="btn" onClick={() => advance(s)}>
                      {s.status === 'Pending' ? 'Start Edit' : 'Mark Delivered'}
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

/* ---------- Commission tracker ----------
   Partners see only their own row; Founder and Core see the full table
   (via the Commission Tracker module page). */
export function CommissionPanel() {
  const { commissions, userId, currentUser } = useDashboard();
  const mine = commissions.filter((c) => c.agentId === userId);
  const rows = mine.length ? mine : [{ agent: currentUser ? currentUser.name : 'You', pending: '₹0', paid: '₹0' }];

  return (
    <section className="panel">
      <h4>Commission Tracker</h4>
      <div className="muted small">Your position only</div>
      <div style={{ marginTop: 10 }}>
        {rows.map((c) => (
          <div className="ver-row" key={c.agent}>
            <div className="grow">
              <strong>{c.agent}</strong>
              <div className="small muted">Paid {c.paid} • Pending {c.pending}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Issues raised by this partner ---------- */
export function MyIssuesPanel() {
  const { tickets, userId } = useDashboard();
  const mine = tickets.filter((t) => t.raiser === userId).slice().reverse();

  return (
    <section className="panel">
      <h4>Your Issues &amp; Queries</h4>
      <div className="muted small">Raised by you, tracked to resolution</div>
      <div style={{ marginTop: 10 }}>
        {mine.length === 0 ? (
          <div className="small muted">You have not raised anything yet.</div>
        ) : (
          mine.map((t) => (
            <div className="ver-row" key={t.id}>
              <div className="grow">
                <strong>{t.title}</strong>
                <div className="small muted">{t.category} • {t.priority} • {t.status}</div>
              </div>
              <div className="stack-end">
                <div className="small muted">{timeAgo(t.createdAt)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
