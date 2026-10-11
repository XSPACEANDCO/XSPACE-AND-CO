import { useState } from 'react';
import api from '../lib/api';
import { GENERAL_RULES, ROLE_RULES, RULES_VERSION } from '../lib/rules';
import { seesEverything } from '../lib/roleConfig';
import { useDashboard } from './dashboard/DashboardStore';
import { Chip, Section } from './dashboard/partner/shared';
import './dashboard/partner/partner.css';

/* Rules & Regulations.

   A partner sees the rules that apply to everyone plus their own role's, and
   confirms they have read them. Founder and Core see every role's rules —
   they are the ones enforcing them — and can check who has acknowledged
   from Profile & KYC → Partner compliance. */

const STAMP = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function RuleBlock({ sections }) {
  return sections.map((sec) => (
    <div className="rules-block" key={sec.title}>
      <h5>{sec.title}</h5>
      <ul>
        {sec.points.map((p) => <li key={p}>{p}</li>)}
      </ul>
    </div>
  ));
}

export default function Rules() {
  const { role, currentUser, refresh } = useDashboard();
  const internal = seesEverything(role);
  const [tab, setTab] = useState('realtor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const shownRole = internal ? tab : role;
  const own = ROLE_RULES[shownRole];

  const ackAt = currentUser?.rulesAckAt ? new Date(currentUser.rulesAckAt) : null;
  /* Acknowledging an older version does not count once the rules change. */
  const current = ackAt && ackAt >= new Date(RULES_VERSION);

  async function acknowledge() {
    setError('');
    setBusy(true);
    try {
      await api.users.ackRules();
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not record that');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pd rules">
      <header className="pd-hero">
        <h1>{internal ? 'Rules & Regulations' : 'Rules & Guidelines'}</h1>
        <p>How we work with clients, inventory and each other. Last updated {STAMP.format(new Date(RULES_VERSION))}.</p>
      </header>

      {!internal && (
        <section className={'panel pd-section rules-ack' + (current ? ' done' : '')}>
          {current ? (
            <div>
              <Chip tone="green">✓ Acknowledged</Chip>{' '}
              <span className="small muted">You confirmed these rules on {STAMP.format(ackAt)}.</span>
            </div>
          ) : (
            <>
              <div>
                <strong>Please read these rules and confirm.</strong>
                <div className="small muted">
                  {ackAt ? 'The rules have changed since you last confirmed them.' : 'Your confirmation is recorded with your account.'}
                </div>
              </div>
              <button className="btn" disabled={busy} onClick={acknowledge}>
                {busy ? 'Saving…' : 'I have read and agree'}
              </button>
            </>
          )}
          {error && <div className="pd-error">{error}</div>}
        </section>
      )}

      {internal && (
        <div className="pd-actions">
          <div className="pd-actions-title">Rules for</div>
          <div className="pd-actions-row">
            {Object.entries(ROLE_RULES).map(([k, r]) => (
              <button key={k} className={tab === k ? 'btn' : 'btn-ghost'} onClick={() => setTab(k)}>
                {r.heading}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="pd-grid">
        <div className="pd-col">
          {own && (
            <Section title={`📘 ${own.heading}`} subtitle="Specific to this role">
              <RuleBlock sections={own.sections} />
            </Section>
          )}
        </div>
        <aside className="pd-col">
          <Section title="🤝 Everyone" subtitle="Applies to every partner">
            <RuleBlock sections={GENERAL_RULES} />
          </Section>
        </aside>
      </div>
    </div>
  );
}
