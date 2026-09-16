import { timeAgo } from '../../../lib/time';
import { FUNNEL_BUCKETS } from '../../../lib/leadStatus';
import { useDashboard } from '../DashboardStore';

/* Five funnel columns over a longer pipeline — see lib/leadStatus.js. */
const DAY = 24 * 60 * 60 * 1000;

/* Realtor (area) partner KPIs, counted from the rows the server already
   scoped to this partner — assigned leads, their visits and their listings.
   Nothing here filters by user id, because nothing here was given anybody
   else's records to begin with. */
export default function RealtorPanel() {
  const { leads, visits, listings } = useDashboard();

  const now = Date.now();
  const ageOf = (l) => (l.createdAt ? now - new Date(l.createdAt).getTime() : 0);

  const completedThisWeek = visits.filter(
    (v) => v.status === 'Completed' && v.endedAt && now - new Date(v.endedAt).getTime() < 7 * DAY
  ).length;
  const conversions = leads.filter((l) => l.status === 'Closed').length;
  const activeListings = listings.filter((l) => l.status !== 'Sold').length;
  const verified = listings.filter((l) => l.verified).length;
  const listingQuality = listings.length ? Math.round((verified / listings.length) * 100) : 0;

  const upcoming = visits
    .filter((v) => {
      if (!v.scheduledAt) return false;
      const t = new Date(v.scheduledAt).getTime();
      return t > now - DAY && t < now + 2 * DAY;
    })
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  const kpis = [
    ['Visits Completed (week)', completedThisWeek],
    ['Conversions', conversions],
    ['Assigned Leads', leads.length],
    ['Active Listings', activeListings],
    ['Listing Quality (%)', listingQuality + '%'],
    ['Visits Scheduled', visits.length],
  ];

  const buckets = [
    ['0-3 days', leads.filter((l) => ageOf(l) <= 3 * DAY).length],
    ['4-7 days', leads.filter((l) => ageOf(l) > 3 * DAY && ageOf(l) <= 7 * DAY).length],
    ['8+ days', leads.filter((l) => ageOf(l) > 7 * DAY).length],
  ];

  return (
    <section className="panel agent-panel">
      <h4>Realtor Partner Dashboard</h4>
      <div className="muted small">Your leads, site visits, listings &amp; feedback — visible to you only</div>

      <div className="kpi-grid">
        {kpis.map(([title, num]) => (
          <div className="kpi" key={title}>
            <h3>{title}</h3>
            <div className="num">{num}</div>
          </div>
        ))}
      </div>

      <div className="subsection">
        <h4>Assigned Leads</h4>
        <div className="muted small">Age buckets of assigned leads</div>
        <div className="age-buckets">
          {buckets.map(([label, n]) => (
            <div className="lead-metric" key={label}>
              <h5>{label}</h5>
              <div className="val">{n}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="subsection">
        <h4>Assigned Lead Funnel</h4>
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
        <h4>Scheduled Visits (today / tomorrow)</h4>
        <div style={{ marginTop: 8 }}>
          {upcoming.length === 0 ? (
            <div className="small muted">No scheduled visits for today/tomorrow.</div>
          ) : (
            upcoming.map((v) => {
              const listing = listings.find((l) => l.id === v.listingId) || {};
              const client = leads.find((c) => c.id === v.leadId) || {};
              return (
                <div className="ver-row" key={v.id}>
                  <div className="grow">
                    <strong>{listing.title || 'Listing'}</strong>
                    <div className="small muted">
                      {client.name || 'Client'} • {new Date(v.scheduledAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="stack-end">
                    <div className="small muted">{timeAgo(v.scheduledAt)}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
