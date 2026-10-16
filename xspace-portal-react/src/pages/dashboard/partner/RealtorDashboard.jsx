import { useNavigate } from 'react-router-dom';
import { timeAgo } from '../../../lib/time';
import { OPEN_VISIT_STATUSES } from '../../../lib/leadStatus';
import { useDashboard } from '../DashboardStore';
import {
  ActionBar, Chip, Empty, Feed, Figures, Hero, KpiRow, Section,
  dayBucket, startOfToday, timeOf, whenLabel,
} from './shared';
import './partner.css';

/* Realtor (Area) Partner dashboard: what needs attention today.

   A realtor partner works property and site visits. The customer
   relationship is Xspace's, so there are no leads here — only the visits
   Xspace has assigned them and the listings they submitted, both already
   scoped to this partner by the server. */

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

/* Why a visit needs the partner, most urgent first. */
function attentionOf(visit) {
  const due = dayBucket(visit.scheduledAt);
  if (due === 'overdue') return { rank: 0, tone: 'red', label: '🔴 Past due — mark it done' };
  if (visit.status !== 'Confirmed' && due === 'today') return { rank: 1, tone: 'red', label: '🔴 Today, not confirmed' };
  if (due === 'today') return { rank: 2, tone: 'amber', label: '🟠 Today' };
  if (visit.status !== 'Confirmed') return { rank: 3, tone: 'amber', label: '🟠 Awaiting confirmation' };
  return null;
}

export default function RealtorDashboard() {
  const navigate = useNavigate();
  const { currentUser, userId, visits, listings, activity, notifications } = useDashboard();

  const now = Date.now();
  const open = visits.filter((v) => OPEN_VISIT_STATUSES.includes(v.status) && timeOf(v.scheduledAt) !== null);
  const upcomingVisits = open
    .filter((v) => timeOf(v.scheduledAt) >= startOfToday())
    .sort((a, b) => timeOf(a.scheduledAt) - timeOf(b.scheduledAt));
  const visitsToday = upcomingVisits.filter((v) => dayBucket(v.scheduledAt) === 'today');
  const unconfirmed = upcomingVisits.filter((v) => v.status !== 'Confirmed');
  const thisWeek = upcomingVisits.filter((v) => timeOf(v.scheduledAt) < now + 7 * DAY);

  const attention = open
    .map((v) => ({ visit: v, why: attentionOf(v) }))
    .filter((x) => x.why)
    .sort((a, b) => a.why.rank - b.why.rank || timeOf(a.visit.scheduledAt) - timeOf(b.visit.scheduledAt))
    .slice(0, 5);

  const activeListings = listings.filter((l) => l.status !== 'Sold');
  const verified = listings.filter((l) => l.verified);
  const completedVisits = visits.filter((v) => v.status === 'Completed');

  /* Founder/Core actions and the partner's own (the server scopes the feed
     that way), merged with what was done *to* their work — a visit
     assigned, a listing verified. */
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

  return (
    <div className="pd">
      <Hero name={currentUser?.name} subtitle="Your listings and the site visits Xspace has assigned you." />

      <KpiRow
        items={[
          { icon: '📅', label: 'Visits Today', value: visitsToday.length },
          { icon: '🗓️', label: 'Upcoming Visits', value: upcomingVisits.length, hint: `${thisWeek.length} this week` },
          { icon: '⏳', label: 'Awaiting Confirmation', value: unconfirmed.length },
          { icon: '🏠', label: 'Active Listings', value: activeListings.length },
          { icon: '✅', label: 'Visits Completed', value: completedVisits.length },
        ]}
      />

      <ActionBar
        title="Quick Actions"
        actions={[
          { label: 'Add Listing', to: '/listings?new=1' },
          { label: 'Site Visits', to: '/site-visits' },
          { label: 'Area Updates', to: '/area-updates' },
          { label: 'Upload Media', to: '/media-upload' },
        ]}
      />

      <div className="pd-grid">
        <div className="pd-col">
          <Section title="🔔 Visits Needing Action" subtitle="Confirm them, then mark them done" more={{ label: 'Open Site Visits', to: '/site-visits' }}>
            {attention.length === 0 ? (
              <Empty>Nothing needs you right now.</Empty>
            ) : (
              <div className="pd-list">
                {attention.map(({ visit: v, why }) => (
                  <div className="pd-item" key={v.id}>
                    <div className="pd-item-main">
                      <div className="pd-item-title">{v.listingTitle || 'Site visit'}</div>
                      <div className="pd-item-meta">{v.clientName || 'Client'} • {whenLabel(v.scheduledAt)} • {v.mode}</div>
                    </div>
                    <div className="pd-item-side">
                      <Chip tone={why.tone}>{why.label}</Chip>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="📅 Upcoming Site Visits" more={{ label: 'View All Visits', to: '/site-visits' }}>
            {upcomingVisits.length === 0 ? (
              <Empty>No visits scheduled. Xspace assigns them and they appear here.</Empty>
            ) : (
              <div className="pd-list">
                {upcomingVisits.slice(0, 5).map((v) => (
                  <div className="pd-item" key={v.id}>
                    <div className="pd-item-main">
                      <div className="pd-item-title">{v.clientName || 'Client'}</div>
                      <div className="pd-item-meta">{v.listingTitle || 'Listing not set'} • {v.mode} • {v.status}</div>
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
          <Section title="📅 Visit Summary" more={{ label: 'View Visits', to: '/site-visits' }}>
            <Figures
              items={[
                { label: 'Today', value: visitsToday.length, tone: 'amber' },
                { label: 'This Week', value: thisWeek.length, tone: 'green' },
                { label: 'Unconfirmed', value: unconfirmed.length, tone: unconfirmed.length ? 'red' : undefined },
              ]}
            />
          </Section>

          <Section title="📊 My Performance">
            <Figures
              items={[
                { label: 'Listings', value: listings.length },
                { label: 'Verified', value: verified.length, tone: 'green' },
                { label: 'Visits Done', value: completedVisits.length },
              ]}
            />
          </Section>

          <Section title="🔔 Recent Activity" subtitle="Your own work, and what Founder and Core did">
            <Feed items={feed} empty="Nothing yet." />
          </Section>
        </aside>
      </div>
    </div>
  );
}
