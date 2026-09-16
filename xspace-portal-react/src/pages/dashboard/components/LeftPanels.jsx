import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { timeAgo } from '../../../lib/time';
import { quickActionsFor } from '../../../lib/roleConfig';
import { filterVerifications, leadsAwaitingLegal, verificationsToCsv } from '../../../lib/metrics';
import { seedDemo } from '../../../lib/seed';
import { useDashboard } from '../DashboardStore';

/* ---------- Daily Snapshot ---------- */
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

/* ---------- Approvals (founder) ---------- */
export function ApprovalsPanel() {
  const { role, notifications, currentUser, update, addAudit } = useDashboard();
  const items = notifications.filter((n) => n.type === 'approval' && (n.role === 'all' || n.role === role));

  function resolve(id, verb) {
    const item = notifications.find((n) => n.id === id);
    if (!item) return;
    update('notifications', (prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    addAudit(`Approval ${item.title} ${verb} by ${currentUser ? currentUser.name : 'me'}`);
  }

  return (
    <section className="panel">
      <h4>Approvals</h4>
      <div className="muted small">Items waiting for approval (Founder-only or escalations)</div>
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
                <button className="btn" onClick={() => resolve(it.id, 'approved')}>Approve</button>
                <button className="btn-ghost" onClick={() => resolve(it.id, 'rejected')}>Reject</button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/* ---------- Quick Actions ---------- */
export function QuickActionsPanel() {
  const { role, update, addAudit, addTicket, addNotification, currentUser } = useDashboard();
  const navigate = useNavigate();
  const allowed = quickActionsFor(role);

  if (allowed.length === 0) return null;

  function run(action) {
    if (!allowed.some((a) => a.action === action)) {
      alert('You do not have permission to perform this action.');
      return;
    }
    const who = currentUser ? currentUser.name : 'user';

    if (action === 'inviteUser') {
      const email = prompt('Invite a partner by email (demo):');
      if (email) {
        alert('Invite sent (demo) to ' + email);
        addAudit(`Invite sent to ${email}`);
      }
    } else if (action === 'addProject') {
      const name = prompt('Project name (demo):');
      if (name) {
        update('projects', (prev) => [
          ...prev,
          { id: 'p' + Date.now(), name, builder: 'Manual', rera: '', status: 'Draft', units: 0 },
        ]);
        addAudit(`Project ${name} created`);
      }
    } else if (action === 'addListing') {
      const title = prompt('Listing title (demo):');
      if (title) {
        update('listings', (prev) => [
          ...prev,
          { id: 'l' + Date.now(), title, projectId: '', area: '', price: '', unitType: '', status: 'Available' },
        ]);
        addAudit(`Listing ${title} created`);
      }
    } else if (action === 'uploadLead') {
      navigate('/lead-uploads');
    } else if (action === 'uploadMedia') {
      navigate('/media-upload');
    } else if (action === 'raiseIssue') {
      const title = prompt('Describe the issue (demo):');
      if (title) {
        addTicket({ category: 'other', priority: 'medium', title, desc: title });
        addNotification({ type: 'ticket', title: `Issue from ${who}`, body: title, role: 'core' });
        addAudit(`Issue raised by ${who}: ${title}`);
        alert('Issue raised (demo). Core team has been notified.');
      }
    } else if (action === 'createVisit') {
      navigate('/site-visits');
    } else if (action === 'verifyRera') {
      navigate('/verifications');
    } else if (action === 'exportData') {
      alert('Exporting data (demo) — CSV would be generated in production.');
    }
  }

  return (
    <section className="panel">
      <h4>Quick Actions</h4>
      <div className="quick-actions">
        {allowed.map((a) => (
          <button key={a.action} className={a.ghost ? 'btn-ghost' : 'btn'} onClick={() => run(a.action)}>
            {a.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------- Activity Feed ---------- */
export function ActivityPanel() {
  const { role, activity, currentUser } = useDashboard();

  let items = activity.slice().reverse();
  if ((role === 'realtor' || role === 'creator') && currentUser) {
    const first = currentUser.name.split(' ')[0].toLowerCase();
    items = items.filter((a) => (a.text || '').toLowerCase().includes(first));
  }

  return (
    <section className="panel">
      <h4>Recent Activity</h4>
      <div className="muted small">Recent actions from your team</div>
      <div className="activity">
        {items.length === 0 ? (
          <div className="small muted">No recent activity</div>
        ) : (
          items.map((a) => (
            <div className="activity-item" key={a.id}>
              <div className="activity-avatar-col">
                <div className="activity-avatar" />
              </div>
              <div>
                <div style={{ fontSize: 13 }}>
                  <strong>{a.text}</strong>
                </div>
                <div className="small muted">{timeAgo(a.time)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/* ---------- Verification Queue (core / founder) ---------- */
export function VerificationPanel() {
  const { verifications, listings, projects, currentUser, userId, update, addAudit } = useDashboard();
  const [filter, setFilter] = useState('all');
  const items = filterVerifications(verifications, filter);

  const who = currentUser ? currentUser.name : 'user';

  function start(id) {
    update('verifications', (prev) =>
      prev.map((v) =>
        v.id === id ? { ...v, status: 'inprogress', assignedTo: userId, startedAt: v.startedAt || Date.now() } : v
      )
    );
    addAudit(`Verification ${id} started by ${who}`);
  }

  function markVerified(id) {
    const target = verifications.find((v) => v.id === id);
    update('verifications', (prev) =>
      prev.map((v) =>
        v.id === id ? { ...v, status: 'verified', finishedAt: Date.now(), startedAt: v.startedAt || Date.now() } : v
      )
    );
    if (target && target.listingId) {
      update('listings', (prev) => prev.map((l) => (l.id === target.listingId ? { ...l, verified: true } : l)));
    }
    addAudit(`Verification ${id} marked VERIFIED by ${who}`);
  }

  function escalate(id) {
    update('verifications', (prev) =>
      prev.map((v) => (v.id === id ? { ...v, escalated: true, status: 'escalated' } : v))
    );
    update('tickets', (prev) => [
      ...prev,
      {
        id: 't' + Date.now(),
        title: `Escalation: verification ${id}`,
        category: 'legal',
        priority: 'high',
        raiser: userId,
        status: 'open',
        createdAt: Date.now(),
      },
    ]);
    addAudit(`Verification ${id} escalated to legal by ${who}`);
  }

  function exportCsv() {
    if (!verifications.length) {
      alert('No verifications to export');
      return;
    }
    const blob = new Blob([verificationsToCsv(verifications)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'verifications.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel">
      <h4>Verification Queue</h4>
      <div className="muted small">Project / Legal / Listing verifications — Core Team workload</div>

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
          <button className="btn-ghost" onClick={exportCsv}>Export CSV</button>
          <button
            className="btn-ghost"
            onClick={() => {
              seedDemo();
              alert('Demo verification data seeded (if not already).');
            }}
          >
            Seed Demo Verifications
          </button>
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
                      <button className="btn" onClick={() => start(v.id)}>Start Verification</button>
                    )}
                    {v.status === 'inprogress' && (
                      <button className="btn" onClick={() => markVerified(v.id)}>Mark Verified</button>
                    )}
                    {v.status !== 'escalated' && v.status !== 'verified' && (
                      <button className="btn-ghost" onClick={() => escalate(v.id)}>Escalate to Legal</button>
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

/* ---------- Support Ticket Inbox ---------- */
export function SupportPanel() {
  const { tickets } = useDashboard();
  const open = tickets.filter((t) => t.status === 'open').length;
  const high = tickets.filter((t) => t.priority === 'high' && t.status === 'open').length;
  const recent = tickets.slice().reverse().slice(0, 6);

  return (
    <section className="panel">
      <h4>Support Ticket Inbox</h4>
      <div className="muted small">Internal tickets from Agents / Creators / Studio</div>
      <div style={{ marginTop: 10 }}>
        <div className="small muted">
          Quick View: <span>Open: {open}</span> • <span>High: {high}</span>
        </div>
        <div style={{ marginTop: 8 }}>
          {recent.length === 0 ? (
            <div className="small muted">No tickets</div>
          ) : (
            recent.map((t) => (
              <div className="ver-row" key={t.id}>
                <div className="grow">
                  <strong>{t.title}</strong>
                  <div className="small muted">
                    {t.category} • {t.priority}
                  </div>
                </div>
                <div className="stack-end">
                  <div className="small muted">{timeAgo(t.createdAt)}</div>
                  <div>
                    <button className="btn-ghost" onClick={() => alert('Open ticket (demo): ' + t.id)}>Open</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="btn-ghost" onClick={() => alert('Open Ticket Dashboard (demo)')}>
            Open Ticket Dashboard
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------- Leads Awaiting Legal Go-Ahead ---------- */
export function LeadsLegalPanel() {
  const { leads, listings, currentUser, update, addAudit } = useDashboard();
  const awaiting = leadsAwaitingLegal(leads, listings);

  function clearLegal(lead) {
    const li = listings.find((l) => l.assignedAgent === lead.assignedAgent && l.verified === false);
    if (!li) {
      alert('No matching unverified listing found to mark cleared (demo).');
      return;
    }
    update('listings', (prev) => prev.map((l) => (l.id === li.id ? { ...l, verified: true } : l)));
    addAudit(`Lead ${lead.name} legal cleared by ${currentUser ? currentUser.name : 'user'}`);
  }

  return (
    <section className="panel">
      <h4>Leads Awaiting Legal Go-Ahead</h4>
      <div className="muted small">Filtered leads that require legal clearance before visits</div>
      <div style={{ marginTop: 10 }}>
        {awaiting.length === 0 ? (
          <div className="small muted">No leads awaiting legal go-ahead.</div>
        ) : (
          awaiting.map((ld) => (
            <div className="ver-row" key={ld.id}>
              <div className="grow">
                <strong>{ld.name}</strong>
                <div className="small muted">
                  {ld.source} • {ld.budget}
                </div>
              </div>
              <div className="stack-end">
                <button className="btn" onClick={() => clearLegal(ld)}>Mark Legal Cleared</button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
