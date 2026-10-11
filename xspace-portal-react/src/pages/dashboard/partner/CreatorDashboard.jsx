import { useNavigate } from 'react-router-dom';
import { timeAgo } from '../../../lib/time';
import { creatorLabel } from '../../../lib/mediaStatus';
import { useDashboard } from '../DashboardStore';
import { useCreatorStats } from './creatorStats';
import {
  ActionBar, Chip, Empty, Feed, Figures, Hero, KpiRow, Section,
  compact, leadTone, percent, requirementLine, rupees, timeOf, whenLabel,
} from './shared';
import './partner.css';

/* Creator Partner dashboard.

   It answers three questions, in this order: what am I creating, how many
   people does it reach, and how much business does it generate. Everything
   is the creator's own — company-wide activity ("X added listing Y") is
   deliberately absent. */

export function contentTone(m) {
  if (m.status === 'approved') return 'green';
  if (m.status === 'delivered') return 'blue';
  if (m.status === 'in_progress' || m.status === 'qc') return 'amber';
  if (m.status === 'changes_requested') return 'purple';
  if (m.status === 'rejected') return 'red';
  return 'grey';
}

/* Content → leads table, shared with the Performance page. */
export function ContentLeadTable({ rows }) {
  if (!rows.length) {
    return <Empty>Once your content is published, each piece and the leads it brought in appear here.</Empty>;
  }
  return (
    <div className="pd-table-wrap">
      <table className="pd-table">
        <thead>
          <tr>
            <th>Content</th>
            <th>Views</th>
            <th>Leads</th>
            <th>Qualified</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.media.id}>
              <td>{r.media.title}</td>
              <td>{r.views === null || r.views === undefined ? '—' : compact(r.views)}</td>
              <td>{r.leads}</td>
              <td>{r.qualified}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CreatorDashboard() {
  const navigate = useNavigate();
  const { currentUser, notifications, earnings } = useDashboard();
  const s = useCreatorStats();

  const inProduction = s.media.filter((m) => m.status !== 'approved' && m.status !== 'rejected');
  const upcoming = s.media
    .filter((m) => m.dueAt && m.status !== 'approved' && m.status !== 'rejected')
    .sort((a, b) => timeOf(a.dueAt) - timeOf(b.dueAt))
    .slice(0, 5);

  const recentLeads = [...s.attributed]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  const activity = notifications.slice(0, 6).map((n) => ({
    id: n.id,
    title: n.title,
    detail: n.body,
    ago: timeAgo(n.createdAt),
  }));

  const conversion = percent(s.deals.length, s.leads.length);

  return (
    <div className="pd">
      <Hero
        name={currentUser?.name}
        subtitle="Here's how your content is performing and what needs your attention."
      />

      <KpiRow
        items={[
          { icon: '🎬', label: 'Content Published', value: s.published.length },
          { icon: '👀', label: 'Total Reach', value: s.reachKnown ? compact(s.reach) : '—', hint: s.reachKnown ? null : 'Add views in My Content' },
          { icon: '🔥', label: 'Leads Generated', value: s.leads.length },
          { icon: '🎯', label: 'Qualified Leads', value: s.qualified.length },
          { icon: '🤝', label: 'Deals Closed', value: s.deals.length },
        ]}
      />

      <ActionBar
        title="Creator Actions"
        actions={[
          { label: '+ Submit Content', to: '/media-upload' },
          { label: '+ Submit Lead', to: '/clients?new=1' },
          { label: '📅 Content Calendar', to: '/content-calendar' },
          { label: '📊 Performance', to: '/performance' },
        ]}
      />

      <div className="pd-grid">
        <div className="pd-col">
          <Section
            title="🎬 My Content Performance"
            subtitle="Your published content, best performers first"
            more={{ label: 'View All Content', to: '/my-content' }}
          >
            {s.perContent.length === 0 ? (
              <Empty>
                Nothing published yet. Content appears here once Studio has edited it and Core has
                approved it.
              </Empty>
            ) : (
              <div className="pd-list">
                {s.perContent.slice(0, 3).map((r) => (
                  <div className="pd-item" key={r.media.id}>
                    <div className="pd-item-main">
                      <div className="pd-item-title">{r.media.title}</div>
                      <div className="pd-item-meta">
                        {r.views === null || r.views === undefined ? 'Views not added' : `${compact(r.views)} views`}
                        {' • '}{r.leads} {r.leads === 1 ? 'lead' : 'leads'}
                        {' • '}{r.qualified} qualified
                      </div>
                    </div>
                    <div className="pd-item-side">
                      <Chip tone="green">🟢 Published</Chip>
                      <button className="btn-ghost" onClick={() => navigate('/my-content')}>
                        View Content
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="🔥 Leads Generated From Your Content"
            subtitle="Every lead here names the piece of content it came from"
            more={{ label: 'View All Leads', to: '/clients' }}
          >
            {recentLeads.length === 0 ? (
              <Empty>
                No leads credited to your content yet. When you submit a lead, pick the reel or
                video it came from and it will show up here.
              </Empty>
            ) : (
              <div className="pd-list">
                {recentLeads.map((l) => (
                  <div className="pd-item" key={l.id}>
                    <div className="pd-item-main">
                      <div className="pd-item-title">{l.name}</div>
                      <div className="pd-item-meta">{requirementLine(l) || 'Requirement not captured yet'}</div>
                      <div className="pd-item-meta">Source: {l.sourceMediaTitle}</div>
                    </div>
                    <div className="pd-item-side">
                      <Chip tone={leadTone(l.status)}>{l.status}</Chip>
                      <button className="btn-ghost" onClick={() => navigate('/clients/' + l.id)}>
                        View Lead
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="📈 Content → Lead Performance" subtitle="Which content actually generates leads">
            <ContentLeadTable rows={s.perContent.slice(0, 8)} />
          </Section>

          <Section
            title="🎬 Content Production Status"
            subtitle="Creator → Studio → Approval → Published"
            more={{ label: 'View All Content', to: '/my-content' }}
          >
            {inProduction.length === 0 ? (
              <Empty>Nothing in production right now.</Empty>
            ) : (
              <div className="pd-list">
                {inProduction.slice(0, 6).map((m) => (
                  <div className="pd-item" key={m.id}>
                    <div className="pd-item-main">
                      <div className="pd-item-title">{m.title}</div>
                      <div className="pd-item-meta">Sent {timeAgo(m.createdAt)}</div>
                    </div>
                    <div className="pd-item-side">
                      <Chip tone={contentTone(m)}>{creatorLabel(m)}</Chip>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="📅 Upcoming Content"
            more={{ label: 'View Content Calendar', to: '/content-calendar' }}
          >
            {upcoming.length === 0 ? (
              <Empty>Nothing scheduled. Add a due date when you submit content to plan it here.</Empty>
            ) : (
              <div className="pd-list">
                {upcoming.map((m) => (
                  <div className="pd-item" key={m.id}>
                    <div className="pd-item-main">
                      <div className="pd-item-title">{m.title}</div>
                      <div className="pd-item-meta">{whenLabel(m.dueAt)}</div>
                    </div>
                    <div className="pd-item-side">
                      <Chip tone={contentTone(m)}>{creatorLabel(m)}</Chip>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <aside className="pd-col">
          <Section title="🔥 Lead Performance" more={{ label: 'View All Leads', to: '/clients' }}>
            <Figures
              items={[
                { label: 'Leads Generated', value: s.leads.length },
                { label: 'Qualified', value: s.qualified.length },
                { label: 'Site Visits', value: s.visits.length },
                { label: 'Deals Closed', value: s.deals.length, tone: 'green' },
              ]}
            />
            <div className="pd-note">
              Lead Conversion: <strong>{conversion}</strong>
            </div>
          </Section>

          <Section title="🔔 Creator Activity">
            <Feed items={activity} empty="Approvals, revisions and lead updates on your work will appear here." />
          </Section>

          <Section title="⭐ My Performance" more={{ label: 'View Full Performance', to: '/performance' }}>
            <Figures
              items={[
                { label: 'Published', value: s.published.length },
                { label: 'Reach', value: s.reachKnown ? compact(s.reach) : '—' },
                { label: 'Leads', value: s.leads.length },
                { label: 'Qualified', value: s.qualified.length },
                { label: 'Deals', value: s.deals.length },
              ]}
            />
            <div className="pd-note">
              Lead Conversion Rate: <strong>{conversion}</strong>
            </div>
          </Section>

          {/* Shown once the commissions ledger has something of theirs in
              it — an all-zero earnings box is noise. */}
          {earnings && earnings.entries > 0 && (
            <Section title="💰 Earnings" more={{ label: 'View Earnings', to: '/earnings' }}>
              <Figures
                items={[
                  { label: 'Pending', value: rupees(earnings.pending), tone: 'amber' },
                  { label: 'Approved', value: rupees(earnings.approved) },
                  { label: 'Paid', value: rupees(earnings.paid), tone: 'green' },
                ]}
              />
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}
