import PortalLayout from './PortalLayout';
import { useDashboard } from './DashboardStore';

import FounderDashboard from './partner/FounderDashboard';
import RealtorDashboard from './partner/RealtorDashboard';
import CreatorDashboard from './partner/CreatorDashboard';
import StudioDashboard from './partner/StudioDashboard';

function DashboardBody() {
  const { role, loading, error } = useDashboard();

  if (loading) {
    return (
      <section className="panel">
        <div className="muted small">Loading your dashboard…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <h4>Could not load the dashboard</h4>
        <div className="muted small">{error}</div>
      </section>
    );
  }

  /* Every role has a dashboard built around its own job — see ./partner/.
     Founder and Core share one: the whole company, scoped to nothing. */
  if (role === 'realtor') return <RealtorDashboard />;
  if (role === 'creator') return <CreatorDashboard />;
  if (role === 'studio') return <StudioDashboard />;
  return <FounderDashboard />;
}

export default function Dashboard() {
  return (
    <PortalLayout>
      <DashboardBody />
    </PortalLayout>
  );
}
