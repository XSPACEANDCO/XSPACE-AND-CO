import LinkGroups from '../components/LinkGroups';
import { GOV_PORTALS } from '../lib/links';
import { LeadsLegalPanel, VerificationPanel } from './dashboard/components/LeftPanels';
import './dashboard/partner/partner.css';

/* Live Verifications — the Founder/Core desk.

   The queue and the official sources side by side: every claim on a listing
   (RERA number, survey number, approvals, clear title) is checked on one of
   the government portals below before the listing is marked verified. */
export default function Verifications() {
  return (
    <div className="pd">
      <header className="pd-hero">
        <h1>Live Verifications</h1>
        <p>Check each listing against the official portals, then clear it from the queue.</p>
      </header>

      <div className="pd-grid">
        <div className="pd-col">
          <VerificationPanel />
          <LeadsLegalPanel />
        </div>

        <aside className="pd-col">
          <section className="panel pd-section">
            <h4>🏛️ Government portals</h4>
            <div className="muted small pd-sub">
              The official sources. Nothing here is automatic — open the portal and check the
              numbers on the listing against it.
            </div>
            <LinkGroups groups={GOV_PORTALS} />
          </section>
        </aside>
      </div>
    </div>
  );
}
