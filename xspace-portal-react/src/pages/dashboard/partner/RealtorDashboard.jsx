import { useNavigate } from 'react-router-dom';
import { timeAgo } from '../../../lib/time';
import { isOpenLead, isQualified } from '../../../lib/leadStatus';
import { useDashboard } from '../DashboardStore';
import {
  ActionBar, Chip, Empty, Feed, Figures, Hero, KpiRow, Section,
  dayBucket, leadTone, percent, requirementLine, startOfToday, timeOf, whenLabel,
} from './shared';
import './partner.css';

/* Realtor (Area) Partner dashboard: what needs attention today.

   Leads, visits and listings arrive already scoped to this partner, so
   nothing here filters by owner. */

const DAY = 24 * 60 * 60 * 1000;

/* The fields that make a listing sheet usable for a client. Completeness is
   the share of them filled in. */
const LISTING_FIELDS = [
  'title', 'area', 'price', 'propertyType', 'configuration', 'builder', 'possession',
  'superBuiltUp', 'facing', 'basePrice', 'reraNumber', 'approval', 'titleStatus',
  'amenities', 'brochureUrl',
];

function completeness(listing) {
  const filled = LISTING_FIELDS.filter((k) => {
    const v = listing[k];
    return v !== null && v !== undefined && String(v).trim() !== '';
  }).length;
  return Math.round((filled / LISTING_FIELDS.length) * 100);
}

/* Why a lead is on the priority list, most urgent reason first. */
function priorityOf(lead) {
  const due = dayBucket(lead.followUpAt);
  if (due === 'overdue') return { rank: 0, tone: 'red', label: '🔴 Follow-up overdue' };
  if (due === 'today') return { rank: 1, tone: 'red', label: '🔴 Follow-up today' };
  if (lead.status === 'Visit Scheduled') return { rank: 2, tone: 'amber', label: '🟠 Site Visit' };
  if (lead.status === 'Negotiation' || lead.status === 'Token/EOI') {
    return { rank: 3, tone: 'amber', label: `🟠 ${lead.status}` };
  }
  if (lead.status === 'New') return { rank: 4, tone: 'blue', label: '🔵 New' };
  if (lead.temperature === 'hot') return { rank: 5, tone: 'red', label: '🔥 Hot' };
  return { rank: 6, tone: leadTone(lead.status), label: lead.status };
}

export default function RealtorDashboard() {
  const navigate = useNavigate();
  const { currentUser, userId, leads, visits, listings, activity, notifications } = useDashboard();

  const now = Date.now();
  const open = leads.filter((l) => isOpenLead(l.status));

  const followUps = open.filter((l) => l.followUpAt);
  const overdue = followUps.filter((l) => dayBucket(l.followUpAt) === 'overdue');
  const dueToday = followUps.filter((l) => dayBucket(l.followUpAt) === 'today');
  const upcomingFollowUps = followUps.filter((l) => {
    const b = dayBucket(l.followUpAt);
    return b === 'tomorrow' || b === 'later';
  });

  const upcomingVisits = visits
    .filter((v) => v.status === 'Scheduled' || v.status === 'Rescheduled')
    .filter((v) => timeOf(v.scheduledAt) !== null && timeOf(v.scheduledAt) >= startOfToday())
    .sort((a, b) => timeOf(a.scheduledAt) - timeOf(b.scheduledAt));
  const visitsToday = upcomingVisits.filter((v) => dayBucket(v.scheduledAt) === 'today');

  const activeListings = listings.filter((l) => l.status !== 'Sold');
  const deals = leads.filter((l) => l.status === 'Closed');
  const qualified = leads.filter((l) => isQualified(l.status));
  const completedVisits = visits.filter((v) => v.status === 'Completed');

  const priority = open
    .map((l) => ({ lead: l, why: priorityOf(l) }))
    .sort((a, b) => a.why.rank - b.why.rank || new Date(b.lead.createdAt) - new Date(a.lead.createdAt))
    .slice(0, 5);

  /* Founder/Core actions and the partner's own (the server scopes the feed
     that way), merged with what was done *to* their work — a lead assigned,
     a listing verified, a status moved. */
  const feed = [
    ...activity.map((a) => ({
      id: 'a' + a.id,
      title: a.text,
      detail: a.actorId === userId ? 'You' : a.actorName,
      at: a.createdAt,
    })),
    ...notifications.map((n) => ({ id: 'n' + n.id, title: n.title, detail: n.body, at: n.createdAt })),
  ]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 8)
    .map((e) => ({ ...e, ago: timeAgo(e.at) }));

  const newThisWeek = leads.filter((l) => now - new Date(l.createdAt).getTime() < 7 * DAY).length;

  return (
    <div className="pd">
      <Hero name={currentUser?.name} subtitle="Here's what needs your attention today." />

      <KpiRow
        items={[
          { icon: '🆕', label: 'New Leads', value: leads.filter((l) => l.status === 'New').length, hint: `${newThisWeek} added this week` },
          { icon: '📞', label: 'Follow-ups', value: overdue.length + dueToday.length, hint: overdue.length ? `${overdue.length} overdue` : 'Due today' },
          { icon: '📅', label: 'Site Visits', value: upcomingVisits.length, hint: `${visitsToday.length} today` },
          { icon: '🏠', label: 'Active Listings', value: activeListings.length },
          { icon: '🤝', label: 'Deals Closed', value: deals.length },
        ]}
      />

      <ActionBar
        title="Quick Actions"
        actions={[
          { label: '+ Add Lead', to: '/clients?new=1' },
          { label: 'Schedule Visit', to: '/site-visits' },
          { label: 'Add Listing', to: '/listings?new=1' },
          { label: 'Submit Feedback', to: '/site-visits' },
        ]}
      />

      <div className="pd-grid">
        <div className="pd-col">
          <Section title="🔥 Priority Leads" subtitle="Who to call first" more={{ label: 'View All Leads', to: '/clients' }}>
            {priority.length === 0 ? (
              <Empty>No open leads. New leads assigned to you will appear here.</Empty>
            ) : (
              <div className="pd-list">
                {priority.map(({ lead, why }) => (
                  <div className="pd-item" key={lead.id}>
                    <div className="pd-item-main">
                      <div className="pd-item-title">{lead.name}</div>
                      <div className="pd-item-meta">
                        {requirementLine(lead) || 'Requirement not captured yet'}
                        {lead.followUpAt ? ` • Follow-up ${whenLabel(lead.followUpAt)}` : ''}
                      </div>
                    </div>
                    <div className="pd-item-side">
                      <Chip tone={why.tone}>{why.label}</Chip>
                      <button className="btn-ghost" onClick={() => navigate('/clients/' + lead.id)}>
                        Open
                      </button>
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
                      <div className="pd-item-meta">{v.listingTitle || 'Listing not set'} • {v.mode}</div>
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

          <Section title="🏠 My Listings" more={{ label: 'View All Listings', to: '/listings' }}>
            {listings.length === 0 ? (
              <Empty>You have not submitted any listings yet.</Empty>
            ) : (
              <div className="pd-list">
                {listings.slice(0, 5).map((l) => {
                  const pct = completeness(l);
                  return (
                    <div className="pd-item" key={l.id}>
                      <div className="pd-item-main">
                        <div className="pd-item-title">{l.title}</div>
                        <div className="pd-item-meta">
                          {[l.area, l.price].filter(Boolean).join(' • ') || '—'} • {pct}% complete
                        </div>
                      </div>
                      <div className="pd-item-side">
                        <Chip tone={l.verified ? 'green' : 'amber'}>
                          {l.verified ? 'Verified' : 'Pending verification'}
                        </Chip>
                        <button className="btn-ghost" onClick={() => navigate('/listings/' + l.id)}>
                          Open
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        <aside className="pd-col">
          <Section title="📞 Follow-up Summary" more={{ label: 'View Follow-ups', to: '/clients' }}>
            <Figures
              items={[
                { label: 'Overdue', value: overdue.length, tone: 'red' },
                { label: 'Due Today', value: dueToday.length, tone: 'amber' },
                { label: 'Upcoming', value: upcomingFollowUps.length, tone: 'green' },
              ]}
            />
            {followUps.length === 0 && (
              <div className="pd-note">Set a next follow-up date on a lead to track it here.</div>
            )}
          </Section>

          <Section title="📊 My Performance">
            <Figures
              items={[
                { label: 'Leads', value: leads.length },
                { label: 'Qualified', value: qualified.length },
                { label: 'Visits', value: completedVisits.length },
                { label: 'Deals', value: deals.length, tone: 'green' },
              ]}
            />
            <div className="pd-note">
              Conversion Rate: <strong>{percent(deals.length, leads.length)}</strong>
            </div>
          </Section>

          <Section title="🔔 Recent Activity" subtitle="Your own work, and what Founder and Core did">
            <Feed items={feed} empty="Nothing yet." />
          </Section>
        </aside>
      </div>
    </div>
  );
}
