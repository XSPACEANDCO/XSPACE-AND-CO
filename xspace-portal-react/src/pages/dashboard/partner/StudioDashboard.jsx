import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../lib/api';
import { timeAgo } from '../../../lib/time';
import { roleLabel } from '../../../lib/roleConfig';
import { BLOCKERS, KIND_LABELS, studioLabel } from '../../../lib/mediaStatus';
import { useDashboard } from '../DashboardStore';
import {
  ActionBar, Chip, Empty, Feed, Figures, Hero, KpiRow, Section,
  dayBucket, timeOf, whenLabel,
} from './shared';
import './partner.css';

/* Xspace Studio dashboard.

   One question: what do I need to produce, what is waiting on someone else,
   and what have I sent to Core/Founder for approval?

   Studio's job ends when it submits a cut for approval. Approving is Core's
   and the Founder's, so nothing on this page approves or rejects — an item
   awaiting approval only ever offers "View Status".

     Request ─▶ Raw media ─▶ Production ─▶ Studio QC ─▶ Core approval ─▶ Delivered
                                  ▲                          │
                                  └──────── revision ────────┘ */

const OPEN = ['pending', 'in_progress', 'qc', 'delivered', 'changes_requested'];

function statusTone(m) {
  if (m.status === 'delivered') return 'purple';
  if (m.status === 'changes_requested') return 'red';
  if (m.status === 'in_progress' || m.status === 'qc') return 'amber';
  if (m.status === 'approved') return 'green';
  return 'blue';
}

function dotTone(m) {
  if (m.status === 'delivered') return 'purple';
  if (m.priority === 'high' || m.status === 'changes_requested') return 'red';
  return 'amber';
}

/* Today's queue order: revisions first (Core is waiting on them), then
   overdue and due today, then high priority, then oldest. Work handed over
   for approval sinks to the bottom — it is no longer Studio's to move. */
function queueRank(m) {
  if (m.status === 'delivered') return 9;
  if (m.status === 'changes_requested') return 0;
  const due = dayBucket(m.dueAt);
  if (due === 'overdue') return 1;
  if (due === 'today') return 2;
  if (m.priority === 'high') return 3;
  if (due === 'tomorrow') return 4;
  return 5;
}

function requester(m) {
  if (!m.uploadedByName) return 'Unknown';
  return m.uploadedByRole ? `${m.uploadedByName} — ${roleLabel(m.uploadedByRole)}` : m.uploadedByName;
}

export default function StudioDashboard() {
  const navigate = useNavigate();
  const { currentUser, media, refresh } = useDashboard();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [openNotes, setOpenNotes] = useState(null);

  async function run(id, fn) {
    setError('');
    setBusy(id);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err.message || 'That did not go through');
    } finally {
      setBusy(null);
    }
  }

  const by = (status) => media.filter((m) => m.status === status);
  const requests = by('pending').filter((m) => !m.url);
  const rawReceived = by('pending').filter((m) => m.url);
  const production = by('in_progress');
  const qc = by('qc');
  const awaiting = by('delivered');
  const revisions = by('changes_requested');
  const approved = by('approved');

  const open = media.filter((m) => OPEN.includes(m.status));
  const studioOpen = open.filter((m) => m.status !== 'delivered');
  const dueToday = studioOpen.filter((m) => {
    const b = dayBucket(m.dueAt);
    return b === 'today' || b === 'overdue';
  });
  const overdueCount = studioOpen.filter((m) => dayBucket(m.dueAt) === 'overdue').length;

  const queue = [...open]
    .sort((a, b) => queueRank(a) - queueRank(b) || timeOf(a.createdAt) - timeOf(b.createdAt))
    .slice(0, 6);

  const blocked = (key) =>
    studioOpen.filter((m) => m.blockedOn === key || (key === 'raw_media' && m.status === 'pending' && !m.url));
  const waiting = [
    { key: 'raw_media', hint: 'Waiting for creator/realtor uploads' },
    { key: 'property_info', hint: 'Missing project details' },
    { key: 'creator_feedback', hint: 'Waiting for clarification' },
  ].map((w) => ({ ...w, label: BLOCKERS[w.key], count: blocked(w.key).length }));

  /* Production grouped by project. */
  const projects = Object.values(
    media
      .filter((m) => m.projectName && m.status !== 'rejected')
      .reduce((acc, m) => {
        const p = (acc[m.projectId] ||= { id: m.projectId, name: m.projectName, items: [] });
        p.items.push(m);
        return acc;
      }, {})
  )
    .map((p) => ({
      ...p,
      delivered: p.items.filter((m) => m.status === 'approved').length,
      approval: p.items.filter((m) => m.status === 'delivered').length,
      inProduction: p.items.filter((m) => ['pending', 'in_progress', 'qc', 'changes_requested'].includes(m.status)).length,
    }))
    .filter((p) => p.inProduction + p.approval > 0)
    .slice(0, 5);

  /* Studio-relevant events, read off the items' own timestamps: footage in,
     cut submitted, Core's verdict. */
  const events = media
    .flatMap((m) => {
      const out = [
        { id: m.id + ':in', at: m.createdAt, title: m.url ? 'Raw media uploaded' : 'Production requested', detail: m.title },
      ];
      if (m.editedAt) out.push({ id: m.id + ':sub', at: m.editedAt, title: 'Submitted for approval', detail: m.title });
      if (m.reviewedAt && (m.status === 'approved' || m.status === 'changes_requested')) {
        const who = m.reviewedByName ? ` by ${m.reviewedByName}` : '';
        out.push({
          id: m.id + ':rev',
          at: m.reviewedAt,
          title: m.status === 'approved' ? `Content approved${who}` : `Revision requested${who}`,
          detail: m.title,
        });
      }
      return out;
    })
    .sort((a, b) => timeOf(b.at) - timeOf(a.at))
    .slice(0, 6)
    .map((e) => ({ ...e, ago: timeAgo(e.at) }));

  /* Workload per editor — only meaningful once there is more than one. */
  const editors = Object.values(
    open
      .filter((m) => m.claimedByName)
      .reduce((acc, m) => {
        const e = (acc[m.claimedBy] ||= { id: m.claimedBy, name: m.claimedByName, production: 0, qc: 0, revision: 0, approval: 0 });
        if (m.status === 'in_progress') e.production += 1;
        if (m.status === 'qc') e.qc += 1;
        if (m.status === 'changes_requested') e.revision += 1;
        if (m.status === 'delivered') e.approval += 1;
        return acc;
      }, {})
  );

  function primaryAction(m) {
    const disabled = busy === m.id;
    if (m.status === 'pending' && !m.url) {
      return <span className="small muted">Waiting for raw media</span>;
    }
    if (m.status === 'pending') {
      return (
        <button className="btn" disabled={disabled} onClick={() => run(m.id, () => api.media.setStatus(m.id, 'in_progress'))}>
          Start Production
        </button>
      );
    }
    if (m.status === 'in_progress') {
      return (
        <>
          <button className="btn" onClick={() => navigate('/raw-media')}>Continue Editing</button>
          <button className="btn-ghost" disabled={disabled} onClick={() => run(m.id, () => api.media.setStatus(m.id, 'qc'))}>
            Send to QC
          </button>
        </>
      );
    }
    if (m.status === 'qc') {
      return <button className="btn" onClick={() => navigate('/raw-media')}>Submit for Approval</button>;
    }
    if (m.status === 'changes_requested') {
      return (
        <button className="btn" disabled={disabled} onClick={() => run(m.id, () => api.media.setStatus(m.id, 'in_progress'))}>
          Start Revision
        </button>
      );
    }
    /* Awaiting approval: Core's decision, not Studio's. */
    return <button className="btn-ghost" onClick={() => navigate('/media-library')}>View Status</button>;
  }

  const stages = [
    { label: 'Requests', value: requests.length },
    { label: 'Raw Media', value: rawReceived.length },
    { label: 'Production', value: production.length, note: revisions.length ? `↺ ${revisions.length} in revision` : null },
    { label: 'Studio QC', value: qc.length },
    { label: 'Core Approval', value: awaiting.length, handoff: true },
    { label: 'Delivered', value: approved.length, done: true },
  ];

  return (
    <div className="pd">
      <Hero name={currentUser?.name} subtitle="Here's what needs to be produced and delivered today." />

      <KpiRow
        items={[
          { icon: '📥', label: 'New Requests', value: by('pending').length, hint: 'Waiting to be started' },
          { icon: '🎬', label: 'In Production', value: production.length + qc.length, hint: 'Being edited or in QC' },
          { icon: '🟣', label: 'Awaiting Approval', value: awaiting.length, hint: 'Submitted to Core/Founder' },
          { icon: '🔄', label: 'Revisions Required', value: revisions.length, hint: 'Changes requested by Core/Founder' },
          { icon: '⏰', label: 'Due Today', value: dueToday.length, hint: overdueCount ? `incl. ${overdueCount} overdue` : 'Production items due today' },
        ]}
      />

      <ActionBar
        title="Studio Actions"
        actions={[
          { label: '+ New Production Request', to: '/media-upload?request=1' },
          { label: '📤 Upload Raw Media', to: '/media-upload' },
          { label: '🎬 Open Production Queue', to: '/raw-media' },
          { label: '📁 Media Library', to: '/media-library' },
        ]}
      />

      {error && <div className="pd-error">{error}</div>}

      <Section title="📊 Production Pipeline" subtitle="Studio's job ends when quality work is submitted for approval">
        <div className="pd-pipeline">
          {stages.map((st, i) => (
            <Fragment key={st.label}>
              {i > 0 && <div className="pd-arrow" aria-hidden="true">→</div>}
              <div className={'pd-stage' + (st.handoff ? ' handoff' : '') + (st.done ? ' done' : '')}>
                <div className="pd-stage-label">{st.label}</div>
                <div className="pd-stage-value">{st.value}</div>
                {st.note && <div className="pd-stage-note">{st.note}</div>}
                {st.handoff && <div className="pd-handoff-tag">Handoff to Core / Founder</div>}
              </div>
            </Fragment>
          ))}
        </div>
      </Section>

      <div className="pd-grid">
        <div className="pd-col">
          <Section
            title="🎬 Today's Production Queue"
            subtitle="Work that needs to be moved forward today"
            more={{ label: 'View Full Production Queue', to: '/raw-media' }}
          >
            {queue.length === 0 ? (
              <Empty>The queue is empty. New requests and raw media land here.</Empty>
            ) : (
              <div className="pd-list">
                {queue.map((m) => (
                  <div className="pd-item" key={m.id}>
                    <div className="pd-item-main">
                      <div className="pd-item-title">
                        <span className={'pd-dot ' + dotTone(m)} aria-hidden="true" />
                        {m.title}
                      </div>
                      <div className="pd-item-meta">
                        Requester: {requester(m)} • {KIND_LABELS[m.kind] || m.kind}
                        {m.projectName ? ` • ${m.projectName}` : ''}
                      </div>
                      <div className="pd-item-meta">
                        {m.priority === 'high' ? 'HIGH priority • ' : ''}
                        {m.dueAt ? `Due ${whenLabel(m.dueAt)}` : 'No due date'}
                        {m.claimedByName ? ` • With ${m.claimedByName}` : ''}
                      </div>
                      <div className="pd-item-actions">{primaryAction(m)}</div>
                    </div>
                    <div className="pd-item-side">
                      <Chip tone={statusTone(m)}>{studioLabel(m)}</Chip>
                      {m.status !== 'delivered' && (
                        <select
                          className="pd-inline-select"
                          aria-label={`What ${m.title} is waiting on`}
                          value={m.blockedOn || ''}
                          disabled={busy === m.id}
                          onChange={(e) => run(m.id, () => api.media.updateMeta(m.id, { blockedOn: e.target.value }))}
                        >
                          <option value="">Not blocked</option>
                          {Object.entries(BLOCKERS).map(([k, label]) => (
                            <option key={k} value={k}>Waiting: {label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="🔄 Revision Queue" subtitle="Sent back by Core/Founder with notes">
            {revisions.length === 0 ? (
              <Empty>No revisions requested.</Empty>
            ) : (
              <div className="pd-list">
                {revisions.map((m) => (
                  <div className="pd-item" key={m.id}>
                    <div className="pd-item-main">
                      <div className="pd-item-title">{m.title}</div>
                      <div className="pd-item-meta">
                        Reviewer: {m.reviewedByName || 'Core Team'}
                        {m.reviewedAt ? ` • ${timeAgo(m.reviewedAt)}` : ''}
                        {m.dueAt ? ` • Due ${whenLabel(m.dueAt)}` : ''}
                      </div>
                      {openNotes === m.id && m.reviewNotes && <div className="pd-quote">“{m.reviewNotes}”</div>}
                      <div className="pd-item-actions">
                        <button className="btn-ghost" onClick={() => setOpenNotes(openNotes === m.id ? null : m.id)}>
                          {openNotes === m.id ? 'Hide Revision Notes' : 'View Revision Notes'}
                        </button>
                        <button
                          className="btn"
                          disabled={busy === m.id}
                          onClick={() => run(m.id, () => api.media.setStatus(m.id, 'in_progress'))}
                        >
                          Start Revision
                        </button>
                      </div>
                    </div>
                    <div className="pd-item-side">
                      <Chip tone="red">🔄 Revision Required</Chip>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="🏠 Active Projects" subtitle="Where production stands, per project" more={{ label: 'View Projects', to: '/projects' }}>
            {projects.length === 0 ? (
              <Empty>No project has work in production. Items linked to a project are grouped here.</Empty>
            ) : (
              <div className="pd-list">
                {projects.map((p) => (
                  <div className="pd-item" key={p.id}>
                    <div className="pd-item-main">
                      <div className="pd-item-title">{p.name}</div>
                      <div className="pd-item-meta">
                        {p.items.length} {p.items.length === 1 ? 'item' : 'items'} • {p.delivered} Delivered
                        {p.approval ? ` • ${p.approval} Approval` : ''} • {p.inProduction} In Production
                      </div>
                    </div>
                    <div className="pd-item-side">
                      <button className="btn-ghost" onClick={() => navigate('/projects')}>Open Project</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <aside className="pd-col">
          <Section title="⚠️ Waiting For" more={{ label: 'View Blocked Work', to: '/raw-media' }}>
            <div className="pd-list">
              {[...waiting, { key: 'approval', label: 'Core/Founder Approval', hint: 'Submitted and waiting for review', count: awaiting.length }].map((w) => (
                <div className="pd-item" key={w.key}>
                  <div className="pd-item-main">
                    <div className="pd-item-title">{w.label}</div>
                    <div className="pd-item-meta">{w.hint}</div>
                  </div>
                  <div className="pd-item-side">
                    <Chip tone={w.count ? (w.key === 'approval' ? 'purple' : 'amber') : 'grey'}>{w.count}</Chip>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="🟣 Approval Status" subtitle="Submitted for approval" more={{ label: 'View Approval Status', to: '/media-library' }}>
            {awaiting.length === 0 ? (
              <Empty>Nothing waiting on Core/Founder.</Empty>
            ) : (
              <div className="pd-list">
                {awaiting.slice(0, 5).map((m) => (
                  <div className="pd-item" key={m.id}>
                    <div className="pd-item-main">
                      <div className="pd-item-title">{m.title}</div>
                      <div className="pd-item-meta">
                        Submitted {timeAgo(m.editedAt || m.deliveredAt)} • v{m.revision || 1}
                      </div>
                    </div>
                    <div className="pd-item-side">
                      <Chip tone="purple">Awaiting Review</Chip>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="📁 Media" more={{ label: 'Open Media Library', to: '/media-library' }}>
            <Figures
              items={[
                { label: 'Raw Media Waiting', value: rawReceived.length },
                { label: 'In Library', value: awaiting.length + approved.length },
                { label: 'Final Assets', value: approved.length, tone: 'green' },
              ]}
            />
          </Section>

          {editors.length > 1 && (
            <Section title="👥 Studio Workload">
              <div className="pd-list">
                {editors.map((e) => (
                  <div className="pd-item" key={e.id}>
                    <div className="pd-item-main">
                      <div className="pd-item-title">{e.name}</div>
                      <div className="pd-item-meta">
                        {[
                          e.production && `${e.production} In Production`,
                          e.qc && `${e.qc} QC`,
                          e.revision && `${e.revision} Revision`,
                          e.approval && `${e.approval} Awaiting Approval`,
                        ].filter(Boolean).join(' • ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="🔔 Studio Activity">
            <Feed items={events} empty="Uploads, submissions and Core's decisions will appear here." />
          </Section>
        </aside>
      </div>
    </div>
  );
}
