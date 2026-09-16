import { useNavigate } from 'react-router-dom';
import { timeAgo } from '../../../lib/time';
import { ROLES } from '../../../lib/roleConfig';
import { FUNNEL_BUCKETS } from '../../../lib/leadStatus';
import { useDashboard } from '../DashboardStore';

/* Five funnel columns over a longer pipeline — see lib/leadStatus.js. */

/* ---------- Lead Funnel ----------
   Stage totals come from /dashboard/funnel (counted in SQL, scoped to the
   role); the cards under each column come from the same scoped /leads. */
export function LeadFunnelPanel() {
  const { funnel, leads } = useDashboard();

  const discovery = funnel?.stages?.find((s) => s.stage === 'Discovery')?.count ?? 0;
  const engaged = funnel?.stages?.find((s) => s.stage === 'Engaged')?.count ?? 0;

  return (
    <section className="panel" title="Lead Funnel — Pre-qualification Stage Analysis">
      <h4>
        Lead Funnel <span className="lead-scope">{funnel?.scope || ''}</span>
      </h4>
      <div className="muted small">Pre-qualification Stage Analysis</div>

      <div className="lead-metrics">
        <div className="lead-metric">
          <h5>Discovery → New leads (not yet qualified)</h5>
          <div className="val">{discovery}</div>
        </div>
        <div className="lead-metric">
          <h5>Engaged → Qualified leads (agent interaction)</h5>
          <div className="val">{engaged}</div>
        </div>
        <div className="lead-metric">
          <h5>Conversion Rate (D → E)</h5>
          <div className="val">{funnel?.conversionRate ?? 0}%</div>
        </div>
      </div>

      <div className="pipeline">
        {FUNNEL_BUCKETS.map(({ stage, statuses }) => {
          const items = leads.filter((l) => statuses.includes(l.status));
          return (
            <div className="pipeline-column" key={stage}>
              <h5>
                {stage} ({items.length})
              </h5>
              {items.map((it) => (
                <div className="pipeline-card" key={it.id}>
                  <strong>{it.name}</strong>
                  <div className="small muted">
                    {it.source || '—'} • {it.budget || '—'}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Studio Journey ---------- */
export function StudioPanel() {
  const { media } = useDashboard();
  const navigate = useNavigate();

  return (
    <section className="panel">
      <h4>Studio Journey</h4>
      <div className="muted small">Shoots, edits and media uploads</div>
      <div className="studio-tiles">
        {media.length === 0 ? (
          <div className="small muted">No studio tasks</div>
        ) : (
          media.slice(0, 8).map((m) => (
            <div className="studio-tile" key={m.id}>
              <div className="row">
                <div>
                  <strong>{m.title || m.kind || 'Media item'}</strong>
                  <div className="small muted">{m.status}</div>
                </div>
                <div>
                  <button className="btn-ghost" onClick={() => navigate('/media-library')}>
                    Open
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/* ---------- Team Overview ----------
   Presence is derived server-side from each person's last request, so this is
   who is actually around rather than a column that always read "online". */
export function TeamPanel() {
  const { users } = useDashboard();
  const navigate = useNavigate();
  const online = users.filter((u) => u.presence === 'online').length;

  return (
    <section className="panel">
      <h4>Team Overview</h4>
      <div className="muted small">
        {online} of {users.length} active now
      </div>
      <div className="team-list">
        {users.map((u) => (
          <div className="team-item" key={u.id}>
            <div style={{ width: 42 }}>
              <div className="team-avatar" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{u.name}</strong>
              <div className="small muted">{u.email}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="small muted">{ROLES[u.role]?.label || u.role}</div>
              <div className={`presence-tag ${u.presence}`}>{u.presence}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <button className="btn-ghost" onClick={() => navigate('/teams')}>
          Open Teams
        </button>
      </div>
    </section>
  );
}

/* ---------- Projects Snapshot ---------- */
export function ProjectsSnapshotPanel() {
  const { projects } = useDashboard();
  const navigate = useNavigate();

  return (
    <section className="panel">
      <h4>Projects Snapshot</h4>
      <div style={{ marginTop: 8 }}>
        {projects.length === 0 ? (
          <div className="small muted">No projects yet.</div>
        ) : (
          projects.map((p) => (
            <div className="project-item" key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <div className="small muted">
                  {p.builder} • {p.status} • {p.units} units
                </div>
              </div>
              <div>
                <button className="btn-ghost" onClick={() => navigate('/projects')}>
                  Open
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/* ---------- Audit Log ---------- */
export function AuditPanel() {
  const { audit } = useDashboard();

  return (
    <section className="panel">
      <h4>Audit Log</h4>
      <div className="muted small">Last important actions</div>
      <div className="audit-log">
        {audit.length === 0 ? (
          <div className="small muted">Nothing logged yet.</div>
        ) : (
          audit.map((a) => (
            <div className="audit-item" key={a.id}>
              <div className="text">{a.text}</div>
              <div className="small muted">
                {a.actorName ? `${a.actorName} • ` : ''}
                {timeAgo(a.createdAt)}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
