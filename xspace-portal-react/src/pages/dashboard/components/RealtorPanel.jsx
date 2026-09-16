import { timeAgo } from '../../../lib/time';
import { partnerMetrics, groupByStage } from '../../../lib/metrics';
import { useDashboard } from '../DashboardStore';

/* Realtor (area) partner KPIs: assigned leads, site visits, listing quality
   and feedback velocity. Scoped to the signed-in partner only. */
export default function RealtorPanel() {
  const {
    userId, leads, visits, listings, listingSubmissions, leadsContributed, leadInteractions,
  } = useDashboard();

  if (!userId) return null;

  const m = partnerMetrics({ userId, leads, visits, listings, listingSubmissions, leadsContributed, leadInteractions });
  const stages = groupByStage(m.myLeads);

  const kpis = [
    ['Visits Completed (week)', m.visitsCompleted],
    ['Conversions', m.conversions],
    ['Leads Contributed (mo)', m.contributed],
    ['Active Listings', m.activeListings],
    ['Listing Quality (%)', m.listingQuality + '%'],
    ['Avg Feedback Time (mins)', m.feedbackVelocity],
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
          <div className="lead-metric"><h5>0-3 days</h5><div className="val">{m.age0_3}</div></div>
          <div className="lead-metric"><h5>4-7 days</h5><div className="val">{m.age4_7}</div></div>
          <div className="lead-metric"><h5>8+ days</h5><div className="val">{m.age8plus}</div></div>
        </div>
      </div>

      <div className="subsection">
        <h4>Assigned Lead Funnel</h4>
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
      </div>

      <div className="subsection">
        <h4>Scheduled Visits (today / tomorrow)</h4>
        <div style={{ marginTop: 8 }}>
          {m.upcomingVisits.length === 0 ? (
            <div className="small muted">No scheduled visits for today/tomorrow.</div>
          ) : (
            m.upcomingVisits.map((v) => {
              const listing = listings.find((l) => l.id === v.listingId) || {};
              const client = leads.find((c) => c.id === v.clientId) || {};
              return (
                <div className="ver-row" key={v.id}>
                  <div className="grow">
                    <strong>{listing.title || listing.name || 'Listing'}</strong>
                    <div className="small muted">
                      {client.name || 'Client'} • {new Date(v.scheduledAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="stack-end">
                    <div className="small muted">{v.scheduledAt ? timeAgo(v.scheduledAt) : ''}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="subsection">
        <h4>Other</h4>
        <div className="small-muted-row">
          <div className="small muted">Lead Update Frequency (48h)</div>
          <div className="small muted">{m.updateFrequency}%</div>
        </div>
        <div className="spacer-8" />
        <div className="small-muted-row">
          <div className="small muted">Scheduled vs Completed Visits</div>
          <div className="small muted">{m.visitCompliance}%</div>
        </div>
      </div>
    </section>
  );
}
