import { canSee } from '../../lib/roleConfig';
import PortalLayout from './PortalLayout';
import { useDashboard } from './DashboardStore';

import RealtorDashboard from './partner/RealtorDashboard';
import CreatorDashboard from './partner/CreatorDashboard';
import StudioDashboard from './partner/StudioDashboard';
import {
  ActivityPanel, ApprovalsPanel, DailySnapshot, LeadsLegalPanel, VerificationPanel,
} from './components/LeftPanels';
import {
  AuditPanel, LeadFunnelPanel, ProjectsSnapshotPanel, StudioPanel, TeamPanel,
} from './components/RightPanels';

function DashboardBody() {
  const { role, cards, loading, error } = useDashboard();

  /* The KPI strip is computed in SQL by /dashboard/snapshot and arrives ready
     to render — the role decides which cards it contains and the scoping is
     already applied, so there is nothing to recompute here. */
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

  /* Each partner has a dashboard of their own, built around their job
     rather than the company's KPI strip — see ./partner/. */
  if (role === 'realtor') return <RealtorDashboard />;
  if (role === 'creator') return <CreatorDashboard />;
  if (role === 'studio') return <StudioDashboard />;

  return (
    <>
      <DailySnapshot cards={cards} />

      <div className="layout">
        {/* left column */}
        <div>
          {canSee('approvalsPanel', role) && <ApprovalsPanel />}
          {canSee('activityPanel', role) && <ActivityPanel />}

          {canSee('verificationPanel', role) && <VerificationPanel />}
          {canSee('leadsLegalPanel', role) && <LeadsLegalPanel />}
        </div>

        {/* right column */}
        <aside>
          {canSee('pipelinePanel', role) && <LeadFunnelPanel />}
          {canSee('studioPanel', role) && <StudioPanel />}
          {canSee('teamPanel', role) && <TeamPanel />}
          {canSee('projectsSnapshot', role) && <ProjectsSnapshotPanel />}
          {canSee('auditPanel', role) && <AuditPanel />}
        </aside>
      </div>
    </>
  );
}

export default function Dashboard() {
  return (
    <PortalLayout>
      <DashboardBody />
    </PortalLayout>
  );
}
