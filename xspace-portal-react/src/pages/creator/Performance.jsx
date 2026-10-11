import { LEAD_STATUSES } from '../../lib/leadStatus';
import { ContentLeadTable } from '../dashboard/partner/CreatorDashboard';
import { useCreatorStats } from '../dashboard/partner/creatorStats';
import { Figures, KpiRow, Section, compact, percent } from '../dashboard/partner/shared';
import '../dashboard/partner/partner.css';

/* Performance — the creator's full results: reach, the leads it produced,
   and how far those leads have travelled through the pipeline. */
export default function Performance() {
  const s = useCreatorStats();

  const byStatus = LEAD_STATUSES.map((status) => ({
    label: status,
    value: s.leads.filter((l) => l.status === status).length,
  }));
  const dropped = s.leads.filter((l) => l.status === 'Dropped').length;

  return (
    <div className="pd">
      <header className="pd-hero">
        <h1>Performance</h1>
        <p>What your content reached, and the business it generated.</p>
      </header>

      <KpiRow
        items={[
          { icon: '🎬', label: 'Content Published', value: s.published.length },
          { icon: '👀', label: 'Total Reach', value: s.reachKnown ? compact(s.reach) : '—' },
          { icon: '🔥', label: 'Leads Generated', value: s.leads.length },
          { icon: '🎯', label: 'Qualified Leads', value: s.qualified.length },
          { icon: '🤝', label: 'Deals Closed', value: s.deals.length },
        ]}
      />

      <div className="pd-grid">
        <div className="pd-col">
          <Section title="📈 Content → Lead Performance" subtitle="Every published piece, best performers first">
            <ContentLeadTable rows={s.perContent} />
          </Section>
        </div>
        <aside className="pd-col">
          <Section title="🎯 Conversion">
            <Figures
              items={[
                { label: 'Lead → Qualified', value: percent(s.qualified.length, s.leads.length) },
                { label: 'Lead → Site Visit', value: percent(s.visits.length, s.leads.length) },
                { label: 'Lead → Deal', value: percent(s.deals.length, s.leads.length), tone: 'green' },
              ]}
            />
            <div className="pd-note">
              {s.attributed.length} of {s.leads.length} leads are credited to a piece of content.
            </div>
          </Section>
          <Section title="🔥 Leads by stage">
            <Figures items={[...byStatus, { label: 'Dropped', value: dropped }]} />
          </Section>
        </aside>
      </div>
    </div>
  );
}
