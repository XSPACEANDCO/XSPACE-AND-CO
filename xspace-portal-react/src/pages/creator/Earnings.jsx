import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { Chip, Empty, Figures, Section, rupees } from '../dashboard/partner/shared';
import { useDashboard } from '../dashboard/DashboardStore';
import '../dashboard/partner/partner.css';

/* Earnings — the partner's commissions, from the commissions ledger. A
   creator's for the content and leads they brought in; a realtor's for the
   deals a closure names them on (recorded by "Mark deal closed"). */

const STAMP = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const TONE = { pending: 'amber', approved: 'blue', paid: 'green' };

export default function Earnings() {
  const { role } = useDashboard();
  const realtor = role === 'realtor';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.dashboard
      .earnings()
      .then(setData)
      .catch((err) => setError(err.message || 'Could not load your earnings'));
  }, []);

  const totals = data?.earnings;
  const rows = data?.commissions || [];

  return (
    <div className="pd">
      <header className="pd-hero">
        <h1>Earnings</h1>
        <p>
          {realtor
            ? 'Commissions on the deals you worked with Xspace.'
            : 'Commissions on the deals your content and leads brought in.'}
        </p>
      </header>

      {error && <div className="pd-error">{error}</div>}

      <Section title="💰 Summary">
        <Figures
          items={[
            { label: 'Pending', value: rupees(totals?.pending), tone: 'amber' },
            { label: 'Approved', value: rupees(totals?.approved) },
            { label: 'Paid', value: rupees(totals?.paid), tone: 'green' },
          ]}
        />
      </Section>

      <Section title="🧾 Commissions">
        {!data ? (
          <Empty>Loading…</Empty>
        ) : rows.length === 0 ? (
          <Empty>
            No commissions recorded yet. When {realtor ? 'a deal you worked on' : 'a deal you sourced'} closes,
            the Xspace team records your commission here and you can follow it from pending to paid.
          </Empty>
        ) : (
          <div className="pd-list">
            {rows.map((c) => (
              <div className="pd-item" key={c.id}>
                <div className="pd-item-main">
                  <div className="pd-item-title">{c.deal_ref || 'Commission'}</div>
                  <div className="pd-item-meta">
                    {STAMP.format(new Date(c.created_at))}
                    {c.note ? ` • ${c.note}` : ''}
                    {c.paid_at ? ` • paid ${STAMP.format(new Date(c.paid_at))}` : ''}
                  </div>
                </div>
                <div className="pd-item-side">
                  <strong>{rupees(Number(c.amount))}</strong>
                  <Chip tone={TONE[c.status] || 'grey'}>{c.status}</Chip>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
