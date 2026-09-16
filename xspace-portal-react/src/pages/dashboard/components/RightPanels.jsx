import { timeAgo } from '../../../lib/time';
import { funnelSummary, groupByStage, leadsForRole } from '../../../lib/metrics';
import { useDashboard } from '../DashboardStore';

/* ---------- Lead Funnel ---------- */
export function LeadFunnelPanel() {
  const { role, userId, leads } = useDashboard();
  const scoped = leadsForRole(leads, role, userId);
  const { discovery, engaged, conversion, scopeLabel } = funnelSummary(scoped, role);
  const stages = groupByStage(scoped);

  return (
    <section className="panel" title="Lead Funnel — Pre-qualification Stage Analysis">
      <h4>
        Lead Funnel <span className="lead-scope">{scopeLabel}</span>
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
          <div className="val">{conversion}%</div>
        </div>
      </div>

      <div className="pipeline">
        {stages.map(({ stage, items }) => (
          <div className="pipeline-column" key={stage}>
            <h5>
              {stage} ({items.length})
            </h5>
            {items.map((it) => (
              <div className="pipeline-card" key={it.id}>
                <strong>{it.name}</strong>
                <div className="small muted">
                  {it.source} • {it.budget}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Studio Journey ---------- */
export function StudioPanel() {
  const { studio } = useDashboard();

  return (
    <section className="panel">
      <h4>Studio Journey</h4>
      <div className="muted small">Shoots, edits and media uploads</div>
      <div className="studio-tiles">
        {studio.length === 0 ? (
          <div className="small muted">No studio tasks</div>
        ) : (
          studio.map((s) => (
            <div className="studio-tile" key={s.id}>
              <div className="row">
                <div>
                  <strong>{s.title}</strong>
                  <div className="small muted">{s.status}</div>
                </div>
                <div>
                  <button className="btn-ghost" onClick={() => alert('Open studio item (demo)')}>Open</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/* ---------- Team Overview ---------- */
export function TeamPanel() {
  const { users } = useDashboard();

  return (
    <section className="panel">
      <h4>Team Overview</h4>
      <div className="muted small">Quick access to team health &amp; access</div>
      <div className="team-list">
        {users.map((u) => (
          <div className="team-item" key={u.id}>
            <div style={{ width: 42 }}>
              <div className="team-avatar" />
            </div>
            <div style={{ flex: 1 }}>
              <strong>{u.name}</strong>
              <div className="small muted">{u.email}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="small muted">{u.role}</div>
              <div className="small muted">{u.presence}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Projects Snapshot ---------- */
export function ProjectsSnapshotPanel() {
  const { projects } = useDashboard();

  return (
    <section className="panel">
      <h4>Projects Snapshot</h4>
      <div style={{ marginTop: 8 }}>
        {projects.map((p) => (
          <div className="project-item" key={p.id}>
            <div>
              <strong>{p.name}</strong>
              <div className="small muted">
                {p.builder} • {p.status} • {p.units} units
              </div>
            </div>
            <div>
              <button className="btn-ghost" onClick={() => alert('Open project details (demo)')}>Open</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Audit Log ---------- */
export function AuditPanel() {
  const { audit } = useDashboard();
  const items = audit.slice().reverse();

  return (
    <section className="panel">
      <h4>Audit Log</h4>
      <div className="muted small">Last important actions</div>
      <div className="audit-log">
        {items.map((a) => (
          <div className="audit-item" key={a.id}>
            <div className="text">{a.text}</div>
            <div className="small muted">{timeAgo(a.ts)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
