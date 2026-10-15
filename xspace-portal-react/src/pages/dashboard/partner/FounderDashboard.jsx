import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../lib/api';
import { timeAgo } from '../../../lib/time';
import { FUNNEL_BUCKETS, isOpenLead } from '../../../lib/leadStatus';
import { ROLES } from '../../../lib/roleConfig';
import { useDashboard } from '../DashboardStore';
import {
  ActionBar, Chip, Empty, Feed, Figures, Hero, KpiRow, Section,
  dayBucket, leadTone, percent, requirementLine, startOfToday, timeOf, whenLabel,
} from './shared';
import './partner.css';

/* Founder (and Core) dashboard: the whole company on one page, laid out
   the same way as the partner dashboards — numbers first, then what is
   waiting on a decision, then the pipelines.

   Every dataset here is the unscoped one (Founder and Core see all rows),
   loaded once by DashboardStore. Nothing is fetched on this page. */

const DAY = 24 * 60 * 60 * 1000;

const VERIFY_TONE = { pending: 'blue', inprogress: 'amber', escalated: 'red', corrections: 'purple', verified: 'green' };
const VERIFY_LABEL = {
  pending: 'Pending', inprogress: 'In progress', escalated: 'Escalated',
  corrections: 'With realtor', verified: 'Verified',
};

export default function FounderDashboard() {
  const navigate = useNavigate();
  const {
    role, currentUser, userId, leads, listings, visits, verifications, media, users, partners,
    notifications, activity, audit, refresh,
  } = useDashboard();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const now = Date.now();
  const isFounder = role === 'founder';

  /* ---- Leads ---- */
  const open = leads.filter((l) => isOpenLead(l.status));
  const newThisWeek = leads.filter((l) => now - new Date(l.createdAt).getTime() < 7 * DAY).length;
  const deals = leads.filter((l) => l.status === 'Closed');
  const overdueFollowUps = open.filter((l) => dayBucket(l.followUpAt) === 'overdue');
  const hot = open
    .filter((l) => l.temperature === 'hot' || l.status === 'Negotiation' || l.status === 'Token/EOI')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  /* ---- Visits ---- */
  const upcomingVisits = visits
    .filter((v) => v.status === 'Scheduled' || v.status === 'Rescheduled')
    .filter((v) => timeOf(v.scheduledAt) !== null && timeOf(v.scheduledAt) >= startOfToday())
    .sort((a, b) => timeOf(a.scheduledAt) - timeOf(b.scheduledAt));
  const visitsToday = upcomingVisits.filter((v) => dayBucket(v.scheduledAt) === 'today');

  /* ---- Verification ---- */
  const openVerifications = verifications.filter((v) => v.status !== 'verified');
  const escalated = openVerifications.filter((v) => v.status === 'escalated');
  const listingTitle = (v) => listings.find((l) => l.id === v.listingId)?.title || 'Listing';

  /* ---- Studio ---- */
  const awaitingReview = media.filter((m) => m.status === 'delivered');
  const inProduction = media.filter((m) => m.status === 'in_progress' || m.status === 'qc');
  const requested = media.filter((m) => m.status === 'pending' || m.status === 'changes_requested');
  const published = media.filter((m) => m.status === 'approved');

  /* ---- People ---- */
  const kycWaiting = partners.filter((p) => p.kycStatus === 'pending' && p.kycSubmittedAt);
  const online = users.filter((u) => u.presence === 'online');

  /* Everything that needs a Founder/Core decision, oldest first. */
  const escalations = notifications.filter((n) => n.type === 'approval' && !n.read);
  const decisions = [
    ...escalations.map((n) => ({
      id: 'n' + n.id,
      notificationId: n.id,
      title: n.title,
      meta: n.body || 'Escalated verification',
      chip: { tone: 'red', label: 'Escalation' },
      to: '/verifications',
      at: n.createdAt,
    })),
    ...awaitingReview.map((m) => ({
      id: 'm' + m.id,
      title: m.title || 'Untitled content',
      meta: [m.uploadedByName, m.projectName].filter(Boolean).join(' • ') || 'Finished cut from Studio',
      chip: { tone: 'purple', label: 'Content review' },
      to: '/media-library',
      at: m.updatedAt || m.createdAt,
    })),
    ...kycWaiting.map((p) => ({
      id: 'k' + p.id,
      title: p.name,
      meta: `${ROLES[p.role]?.label || p.role} • KYC submitted ${timeAgo(p.kycSubmittedAt)}`,
      chip: { tone: 'amber', label: 'KYC' },
      to: '/profile-kyc',
      at: p.kycSubmittedAt,
    })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  async function dismiss(notificationId) {
    setError('');
    setBusy(notificationId);
    try {
      await api.dashboard.markRead(notificationId);
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not dismiss that alert');
    } finally {
      setBusy(null);
    }
  }

  /* Lead pipeline by funnel stage. */
  const stages = FUNNEL_BUCKETS.map(({ stage, statuses }) => ({
    label: stage,
    value: leads.filter((l) => statuses.includes(l.status)).length,
  }));
  const dropped = leads.filter((l) => l.status === 'Dropped').length;

  const feed = activity
    .map((a) => ({
      id: 'a' + a.id,
      title: a.text,
      detail: a.actorId === userId ? 'You' : a.actorName,
      ago: timeAgo(a.createdAt),
    }))
    .slice(0, 8);

  const auditFeed = audit
    .map((a) => ({ id: 'au' + a.id, title: a.text, detail: a.actorName, ago: timeAgo(a.createdAt) }))
    .slice(0, 6);

  return (
    <div className="pd">
      <Hero name={currentUser?.name} subtitle="Here's how Xspace is doing today." />

      <KpiRow
        items={[
          { icon: '🔥', label: 'Open Leads', value: open.length, hint: `${newThisWeek} added this week` },
          {
            icon: '📅',
            label: 'Site Visits',
            value: upcomingVisits.length,
            hint: `${visitsToday.length} today`,
          },
          {
            icon: '🔍',
            label: 'Verifications',
            value: openVerifications.length,
            hint: escalated.length ? `${escalated.length} escalated` : 'None escalated',
          },
          {
            icon: '🎬',
            label: 'Content Review',
            value: awaitingReview.length,
            hint: `${inProduction.length} in production`,
          },
          {
            icon: '🤝',
            label: 'Deals Closed',
            value: deals.length,
            hint: `Conversion ${percent(deals.length, leads.length)}`,
          },
        ]}
      />

      <ActionBar
        title="Quick Actions"
        actions={[
          { label: '+ Add Lead', to: '/clients?new=1' },
          { label: 'Add Property', to: '/listings?new=1' },
          { label: 'Live Verifications', to: '/verifications' },
          { label: 'Partner Dashboards', to: '/partner-dashboards' },
          { label: 'Teams', to: '/teams' },
        ]}
      />

      <div className="pd-grid">
        <div className="pd-col">
          <Section
            title="⚠️ Needs Your Decision"
            subtitle="Escalations, finished content and partner KYC — oldest first"
          >
            {error && <div className="pd-error">{error}</div>}
            {decisions.length === 0 ? (
              <Empty>Nothing is waiting on you.</Empty>
            ) : (
              <div className="pd-list">
                {decisions.slice(0, 8).map((d) => (
                  <div className="pd-item" key={d.id}>
                    <div className="pd-item-main">
                      <div className="pd-item-title">{d.title}</div>
                      <div className="pd-item-meta">{d.meta}</div>
                    </div>
                    <div className="pd-item-side">
                      <Chip tone={d.chip.tone}>{d.chip.label}</Chip>
                      <button className="btn-ghost" onClick={() => navigate(d.to)}>
                        Open
                      </button>
                      {d.notificationId && (
                        <button
                          className="btn-ghost"
                          disabled={busy === d.notificationId}
                          onClick={() => dismiss(d.notificationId)}
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="📈 Lead Pipeline" more={{ label: 'Open CRM', to: '/clients' }}>
            <div className="pd-pipeline">
              {stages.map((st, i) => (
                <Fragment key={st.label}>
                  {i > 0 && <div className="pd-arrow" aria-hidden="true">→</div>}
                  <div className={'pd-stage' + (st.label === 'Closed' ? ' done' : '')}>
                    <div className="pd-stage-label">{st.label}</div>
                    <div className="pd-stage-value">{st.value}</div>
                  </div>
                </Fragment>
              ))}
            </div>
            <div className="pd-note">
              {leads.length} leads in total • {dropped} dropped •{' '}
              {overdueFollowUps.length > 0 ? (
                <strong>{overdueFollowUps.length} follow-ups overdue</strong>
              ) : (
                'no follow-ups overdue'
              )}
            </div>
          </Section>

          <Section title="🔥 Hot Leads" subtitle="Hot, in negotiation or at token" more={{ label: 'View All Leads', to: '/clients' }}>
            {hot.length === 0 ? (
              <Empty>No hot leads right now.</Empty>
            ) : (
              <div className="pd-list">
                {hot.map((lead) => (
                  <div className="pd-item" key={lead.id}>
                    <div className="pd-item-main">
                      <div className="pd-item-title">{lead.name}</div>
                      <div className="pd-item-meta">
                        {requirementLine(lead) || 'Requirement not captured yet'}
                        {lead.assignedToName ? ` • ${lead.assignedToName}` : ''}
                      </div>
                    </div>
                    <div className="pd-item-side">
                      <Chip tone={leadTone(lead.status)}>{lead.status}</Chip>
                      <button className="btn-ghost" onClick={() => navigate('/clients/' + lead.id)}>
                        Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="🔍 Verification Queue" more={{ label: 'Open Live Verifications', to: '/verifications' }}>
            {openVerifications.length === 0 ? (
              <Empty>The queue is clear.</Empty>
            ) : (
              <div className="pd-list">
                {[...escalated, ...openVerifications.filter((v) => v.status !== 'escalated')]
                  .slice(0, 5)
                  .map((v) => (
                    <div className="pd-item" key={v.id}>
                      <div className="pd-item-main">
                        <div className="pd-item-title">{listingTitle(v)}</div>
                        <div className="pd-item-meta">
                          {v.type} • added {timeAgo(v.createdAt)}
                        </div>
                      </div>
                      <div className="pd-item-side">
                        <Chip tone={VERIFY_TONE[v.status] || 'grey'}>{VERIFY_LABEL[v.status] || v.status}</Chip>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </Section>

          <Section title="📅 Upcoming Site Visits" more={{ label: 'View All Visits', to: '/site-visits' }}>
            {upcomingVisits.length === 0 ? (
              <Empty>No visits scheduled.</Empty>
            ) : (
              <div className="pd-list">
                {upcomingVisits.slice(0, 5).map((v) => (
                  <div className="pd-item" key={v.id}>
                    <div className="pd-item-main">
                      <div className="pd-item-title">{v.clientName || 'Client'}</div>
                      <div className="pd-item-meta">
                        {v.listingTitle || 'Listing not set'}
                        {v.agentName ? ` • ${v.agentName}` : ''}
                      </div>
                    </div>
                    <div className="pd-item-side">
                      <Chip tone={dayBucket(v.scheduledAt) === 'today' ? 'amber' : 'blue'}>
                        {whenLabel(v.scheduledAt)}
                      </Chip>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <aside className="pd-col">
          <Section title="🎬 Studio Pipeline" more={{ label: 'Open Media Library', to: '/media-library' }}>
            <Figures
              items={[
                { label: 'Requested', value: requested.length },
                { label: 'In Production', value: inProduction.length, tone: 'amber' },
                { label: 'Awaiting Review', value: awaitingReview.length, tone: 'red' },
                { label: 'Published', value: published.length, tone: 'green' },
              ]}
            />
          </Section>

          <Section title="🏠 Inventory" more={{ label: 'Open Listings', to: '/listings' }}>
            <Figures
              items={[
                { label: 'Listings', value: listings.length },
                { label: 'Unverified', value: listings.filter((l) => !l.verified).length, tone: 'amber' },
                { label: 'Verified', value: listings.filter((l) => l.verified).length, tone: 'green' },
              ]}
            />
          </Section>

          <Section
            title="👥 Team & Partners"
            subtitle={`${online.length} of ${users.length} core team online now`}
            more={{ label: 'Partner Dashboards', to: '/partner-dashboards' }}
          >
            <Figures
              items={['realtor', 'creator', 'studio'].map((r) => ({
                label: ROLES[r]?.label.replace(' Partner', '') || r,
                value: partners.filter((p) => p.role === r).length,
              }))}
            />
            {kycWaiting.length > 0 && (
              <div className="pd-note">
                <strong>{kycWaiting.length}</strong> KYC {kycWaiting.length === 1 ? 'submission' : 'submissions'} to review
              </div>
            )}
          </Section>

          <Section title="🔔 Recent Activity">
            <Feed items={feed} empty="Nothing yet." />
          </Section>

          {isFounder && (
            <Section title="🧾 Audit Log" subtitle="Last important actions">
              <Feed items={auditFeed} empty="Nothing logged yet." />
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}
