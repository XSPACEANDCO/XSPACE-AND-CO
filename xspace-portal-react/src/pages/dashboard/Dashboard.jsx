import { canSee } from '../../lib/roleConfig';
import { snapshotCards } from '../../lib/metrics';
import PortalLayout from './PortalLayout';
import { useDashboard } from './DashboardStore';

import RealtorPanel from './components/RealtorPanel';
import { CommissionPanel, CreatorPanel, MyIssuesPanel, StudioWorkPanel } from './components/PartnerPanels';
import {
  ActivityPanel, ApprovalsPanel, DailySnapshot, LeadsLegalPanel, QuickActionsPanel, SupportPanel, VerificationPanel,
} from './components/LeftPanels';
import {
  AuditPanel, LeadFunnelPanel, ProjectsSnapshotPanel, StudioPanel, TeamPanel,
} from './components/RightPanels';

function DashboardBody() {
  const { role, userId, leads, listings, projects, tickets, verifications, visits } = useDashboard();
  const cards = snapshotCards({ role, userId, leads, listings, projects, tickets, verifications, visits });

  return (
    <>
      <DailySnapshot cards={cards} />

      <div className="layout">
        {/* left column */}
        <div>
          {canSee('approvalsPanel', role) && <ApprovalsPanel />}
          <QuickActionsPanel />
          {canSee('activityPanel', role) && <ActivityPanel />}

          {/* role-specific working panel */}
          {canSee('realtorPanel', role) && <RealtorPanel />}
          {canSee('creatorPanel', role) && <CreatorPanel />}
          {canSee('studioWorkPanel', role) && <StudioWorkPanel />}

          {canSee('verificationPanel', role) && <VerificationPanel />}
          {canSee('supportPanel', role) && <SupportPanel />}
          {canSee('leadsLegalPanel', role) && <LeadsLegalPanel />}
        </div>

        {/* right column */}
        <aside>
          {canSee('pipelinePanel', role) && <LeadFunnelPanel />}
          {canSee('commissionPanel', role) && <CommissionPanel />}
          {canSee('studioPanel', role) && <StudioPanel />}
          {canSee('teamPanel', role) && <TeamPanel />}
          {canSee('projectsSnapshot', role) && <ProjectsSnapshotPanel />}
          {canSee('auditPanel', role) && <AuditPanel />}
          {!canSee('supportPanel', role) && <MyIssuesPanel />}
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
