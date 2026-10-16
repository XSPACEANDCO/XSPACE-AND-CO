import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from './dashboard/DashboardStore';
import api from '../lib/api';
import { FOLLOW_UP_TYPES, TOKEN_STATUSES } from '../lib/leadStatus';
import {
  Field, ListingSelect, PersonSelect, Stage, dayOf, isoOrNull, stamp, toDateInput, toLocalInput, TIME, DAY,
} from './journeyShared';

/* The client journey, stages 8–14 — Founder and Core only.

     follow-up -> negotiation -> token / EOI -> deal closed
     -> handover -> feedback -> referral

   Negotiation, token and closure share one deal record per client (the
   project and unit carry across). Only Xspace manages them: no partner route
   reads lead_deals. Each form is keyed on the record it edits, so a save
   elsewhere on the page never wipes what is being typed here. */

const RUPEES = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const COMMISSION_TONE = { pending: 'scheduled', approved: 'scheduled', paid: 'completed' };

const RATINGS = [
  ['overall', 'Overall'],
  ['communication', 'Communication'],
  ['recommendations', 'Recommendations'],
  ['presentation', 'Presentation'],
  ['site_visit', 'Site visit'],
];

export default function JourneyDeal(props) {
  const { data } = props;
  const { lead, deal } = data;
  return (
    <>
      <FollowUpStage {...props} key={`fu:${lead.follow_up_at}:${data.followups.length}`} />
      <NegotiationStage {...props} key={`neg:${deal?.negotiation_updated_at}`} />
      <TokenStage {...props} key={`tok:${deal?.token_updated_at}`} />
      <ClosureStage {...props} key={`close:${deal?.updated_at}:${lead.status}`} />
      <HandoverStage {...props} key={`ho:${lead.handover_at}:${lead.handover_completed_at}`} />
      <FeedbackStage {...props} />
      <ReferralStage {...props} key={`ref:${data.referrals.length}`} />
    </>
  );
}

/* 8. FOLLOW-UP ------------------------------------------------------------ */

function FollowUpStage({ data, leadId, run, busy }) {
  const { lead, followups, team } = data;
  const [next, setNext] = useState({
    at: toLocalInput(lead.follow_up_at),
    type: lead.follow_up_type || 'Call',
    note: lead.follow_up_note || '',
    owner: lead.follow_up_owner || '',
  });
  const [log, setLog] = useState({ happenedAt: toLocalInput(new Date()), kind: 'Call', outcome: '', notes: '', nextAction: '', nextFollowUpAt: '' });
  const ownerName = team.find((t) => t.id === lead.follow_up_owner)?.name;
  const overdue = lead.follow_up_at && new Date(lead.follow_up_at) < new Date();

  return (
    <Stage n={8} id="stage-8" title="Follow-up" done={followups.length > 0}>
      <div className={'journey-next' + (overdue ? ' overdue' : '')}>
        {lead.follow_up_at ? (
          <>
            <strong>Next: {stamp(lead.follow_up_at)}</strong>
            {` · ${lead.follow_up_type || 'Follow-up'}`}
            {ownerName ? ` · ${ownerName}` : ''}
            {overdue && ' · overdue'}
            {lead.follow_up_note && <div className="muted">{lead.follow_up_note}</div>}
          </>
        ) : (
          <span className="muted">No follow-up scheduled.</span>
        )}
      </div>
      <div className="req-grid">
        <Field label="Follow-up date & time">
          <input type="datetime-local" value={next.at} onChange={(e) => setNext({ ...next, at: e.target.value })} />
        </Field>
        <Field label="Follow-up type">
          <select value={next.type} onChange={(e) => setNext({ ...next, type: e.target.value })}>
            {FOLLOW_UP_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Assigned team member">
          <PersonSelect value={next.owner} onChange={(v) => setNext({ ...next, owner: v })} people={team} empty="Lead owner" />
        </Field>
        <Field label="Notes">
          <input value={next.note} onChange={(e) => setNext({ ...next, note: e.target.value })} placeholder="Share revised price sheet" />
        </Field>
      </div>
      <div className="note-actions">
        <button
          disabled={busy || !next.at}
          onClick={() =>
            run(
              () => api.leads.update(leadId, {
                followUpAt: isoOrNull(next.at), followUpType: next.type, followUpNote: next.note, followUpOwner: next.owner || null,
              }),
              'Follow-up saved'
            )
          }
        >
          Save follow-up
        </button>
        {lead.follow_up_at && (
          <button className="ghost" disabled={busy} onClick={() => run(() => api.leads.update(leadId, { followUpAt: null }), 'Follow-up cleared')}>
            Clear it
          </button>
        )}
      </div>

      <h4 className="journey-sub">Follow-up history</h4>
      {followups.length === 0 ? (
        <div className="muted">No conversations logged yet.</div>
      ) : (
        <div className="journey-table-wrap">
          <table className="journey-table">
            <thead>
              <tr><th>Date</th><th>Type</th><th>Notes</th><th>Outcome</th><th>Next action</th></tr>
            </thead>
            <tbody>
              {followups.map((f) => (
                <tr key={f.id}>
                  <td>{DAY.format(new Date(f.happened_at))}<div className="muted">{TIME.format(new Date(f.happened_at))}</div></td>
                  <td>{f.kind}</td>
                  <td>{f.notes || '—'}{f.created_by_name && <div className="muted">by {f.created_by_name}</div>}</td>
                  <td>{f.outcome || '—'}</td>
                  <td>{f.next_action || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="req-grid">
        <Field label="When">
          <input type="datetime-local" value={log.happenedAt} onChange={(e) => setLog({ ...log, happenedAt: e.target.value })} />
        </Field>
        <Field label="Communication type">
          <select value={log.kind} onChange={(e) => setLog({ ...log, kind: e.target.value })}>
            {FOLLOW_UP_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Outcome">
          <input value={log.outcome} onChange={(e) => setLog({ ...log, outcome: e.target.value })} placeholder="Interested / Awaiting decision" />
        </Field>
        <Field label="Next action">
          <input value={log.nextAction} onChange={(e) => setLog({ ...log, nextAction: e.target.value })} placeholder="Show another project" />
        </Field>
        <Field label="Book next follow-up (optional)">
          <input type="datetime-local" value={log.nextFollowUpAt} onChange={(e) => setLog({ ...log, nextFollowUpAt: e.target.value })} />
        </Field>
      </div>
      <Field label="Notes" wide>
        <textarea rows={2} value={log.notes} onChange={(e) => setLog({ ...log, notes: e.target.value })} placeholder="What was discussed" />
      </Field>
      <div className="note-actions">
        <button
          className="ghost"
          disabled={busy || (!log.outcome.trim() && !log.notes.trim())}
          onClick={() =>
            run(
              () => api.journey.logFollowUp(leadId, {
                ...log, happenedAt: isoOrNull(log.happenedAt), nextFollowUpAt: isoOrNull(log.nextFollowUpAt),
              }),
              'Follow-up logged'
            )
          }
        >
          Log follow-up
        </button>
      </div>
    </Stage>
  );
}

/* 9. NEGOTIATION ---------------------------------------------------------- */

function NegotiationStage({ data, leadId, listings, run, busy }) {
  const d = data.deal || {};
  const [f, setF] = useState({
    listingId: d.listing_id || data.lead.listing_id || '',
    unit: d.unit || '',
    quotedPrice: d.quoted_price || '',
    clientOffer: d.client_offer || '',
    builderResponse: d.builder_response || '',
    currentPosition: d.current_position || '',
    nextAction: d.next_action || '',
    notes: d.negotiation_notes || '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const closed = data.lead.status === 'Closed' || data.lead.status === 'Dropped';

  return (
    <Stage n={9} id="stage-9" title="Negotiation" done={Boolean(d.negotiation_updated_at)}>
      <div className="muted">
        Xspace-managed. Founder and Core only — realtor partners never see this.
        {d.negotiation_updated_at && ` Last updated ${stamp(d.negotiation_updated_at)}.`}
      </div>
      <div className="req-grid">
        <Field label="Project">
          <ListingSelect value={f.listingId} onChange={(v) => setF({ ...f, listingId: v })} listings={listings} />
        </Field>
        <Field label="Unit"><input value={f.unit} onChange={set('unit')} placeholder="Tower B, 1203" /></Field>
        <Field label="Quoted price"><input value={f.quotedPrice} onChange={set('quotedPrice')} placeholder="₹1.20 Cr" /></Field>
        <Field label="Client offer"><input value={f.clientOffer} onChange={set('clientOffer')} placeholder="₹1.10 Cr" /></Field>
        <Field label="Builder response"><input value={f.builderResponse} onChange={set('builderResponse')} placeholder="Can do ₹1.15 Cr with car park" /></Field>
        <Field label="Current position"><input value={f.currentPosition} onChange={set('currentPosition')} placeholder="₹5 L apart" /></Field>
        <Field label="Next action"><input value={f.nextAction} onChange={set('nextAction')} placeholder="Ask builder to waive floor rise" /></Field>
      </div>
      <Field label="Notes" wide>
        <textarea rows={2} value={f.notes} onChange={set('notes')} />
      </Field>
      <div className="note-actions">
        <button disabled={busy || data.lead.status === 'Dropped'} onClick={() => run(() => api.journey.saveNegotiation(leadId, f), 'Negotiation saved')}>
          Save negotiation
        </button>
        {!closed && <span className="muted">Saving moves the client to Negotiation.</span>}
      </div>
    </Stage>
  );
}

/* 10. TOKEN / EOI --------------------------------------------------------- */

function TokenStage({ data, leadId, listings, run, busy }) {
  const d = data.deal || {};
  const [f, setF] = useState({
    listingId: d.listing_id || data.lead.listing_id || '',
    unit: d.unit || '',
    amount: d.token_amount || '',
    date: toDateInput(d.token_date) || toDateInput(new Date().toISOString()),
    status: d.token_status || 'pending',
    documents: d.token_documents || '',
    notes: d.token_notes || '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const label = TOKEN_STATUSES.find((s) => s.key === d.token_status)?.label;

  return (
    <Stage n={10} id="stage-10" title="Token / EOI" done={Boolean(d.token_status && d.token_status !== 'cancelled')}>
      {d.token_status && (
        <div className="journey-facts">
          <span><strong>{d.token_amount}</strong> on {dayOf(d.token_date)}</span>
          <span className={'journey-chip ' + (d.token_status === 'cancelled' ? 'cancelled' : d.token_status === 'pending' ? 'scheduled' : 'completed')}>{label}</span>
        </div>
      )}
      <div className="req-grid">
        <Field label="Project">
          <ListingSelect value={f.listingId} onChange={(v) => setF({ ...f, listingId: v })} listings={listings} />
        </Field>
        <Field label="Unit"><input value={f.unit} onChange={set('unit')} /></Field>
        <Field label="Token / EOI amount"><input value={f.amount} onChange={set('amount')} placeholder="₹2,00,000" /></Field>
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Status">
          <select value={f.status} onChange={set('status')}>
            {TOKEN_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Documents (receipt, EOI form — links or a list)" wide>
        <textarea rows={2} value={f.documents} onChange={set('documents')} />
      </Field>
      <Field label="Notes" wide>
        <textarea rows={2} value={f.notes} onChange={set('notes')} />
      </Field>
      <div className="note-actions">
        <button disabled={busy || !f.amount.trim() || data.lead.status === 'Dropped'} onClick={() => run(() => api.journey.saveToken(leadId, f), 'Token / EOI saved')}>
          Save token / EOI
        </button>
      </div>
    </Stage>
  );
}

/* 11. DEAL CLOSURE -------------------------------------------------------- */

function ClosureStage({ data, leadId, listings, run, busy, emailNote }) {
  const { role } = useDashboard();
  const { lead, team, realtors, commissions } = data;
  const d = data.deal || {};
  const isClosed = lead.status === 'Closed';
  const [f, setF] = useState({
    listingId: d.listing_id || lead.listing_id || '',
    unit: d.unit || '',
    finalValue: d.final_value || '',
    closureDate: toDateInput(d.closure_date) || toDateInput(new Date().toISOString()),
    xspaceOwner: d.xspace_owner || lead.assigned_to || '',
    realtorPartner: d.realtor_partner || '',
    commission: d.commission || '',
    documents: d.closure_documents || '',
    notes: d.closure_notes || '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <Stage n={11} id="stage-11" title="Deal Closure" done={isClosed}>
      {isClosed ? (
        <div className="journey-facts">
          <span>Closed {dayOf(d.closure_date || lead.closed_at)}{d.final_value ? ` at ${d.final_value}` : ''}.</span>
          <span className="muted">The deal closure email went to the client.</span>
        </div>
      ) : (
        <div className="muted">Marking the deal closed moves the client to Closed and emails them the next steps.</div>
      )}
      <div className="req-grid">
        <Field label="Client"><input value={lead.name} disabled /></Field>
        <Field label="Project">
          <ListingSelect value={f.listingId} onChange={(v) => setF({ ...f, listingId: v })} listings={listings} />
        </Field>
        <Field label="Unit"><input value={f.unit} onChange={set('unit')} /></Field>
        <Field label="Final deal value"><input value={f.finalValue} onChange={set('finalValue')} placeholder="₹1.15 Cr" /></Field>
        <Field label="Closure date"><input type="date" value={f.closureDate} onChange={set('closureDate')} /></Field>
        <Field label="Xspace owner">
          <PersonSelect value={f.xspaceOwner} onChange={(v) => setF({ ...f, xspaceOwner: v })} people={team} empty="Lead owner" />
        </Field>
        <Field label="Realtor partner">
          <PersonSelect value={f.realtorPartner} onChange={(v) => setF({ ...f, realtorPartner: v })} people={realtors} empty="None" />
        </Field>
        <Field label="Commission"><input value={f.commission} onChange={set('commission')} placeholder="2% / ₹2.3 L" /></Field>
      </div>
      <div className="muted">
        {commissions.some((c) => c.status !== 'pending')
          ? 'This commission has been approved or paid, so changing the field above no longer changes it.'
          : 'With a realtor partner named, the commission goes into their Earnings as pending — an amount, or a % of the final deal value.'}
      </div>
      {commissions.map((c) => (
        <div className="timeline-item journey-row" key={c.id}>
          <div>
            <strong>{RUPEES.format(Number(c.amount))}</strong> to {c.partner_name || 'partner'}{' '}
            <span className={'journey-chip ' + (COMMISSION_TONE[c.status] || '')}>{c.status}</span>
            <div className="muted">
              {c.deal_ref}{c.note ? ` · ${c.note}` : ''}{c.paid_at ? ` · paid ${stamp(c.paid_at)}` : ''}
            </div>
          </div>
          {role === 'founder' && c.status !== 'paid' && (
            <div className="journey-row-actions">
              {c.status === 'pending' && (
                <button className="lv-inline-btn" disabled={busy} onClick={() => run(() => api.journey.setCommissionStatus(leadId, c.id, 'approved'), 'Commission approved')}>
                  Approve
                </button>
              )}
              <button
                className="lv-inline-btn"
                disabled={busy}
                onClick={() => window.confirm(`Mark ${RUPEES.format(Number(c.amount))} as paid to ${c.partner_name}?`) && run(() => api.journey.setCommissionStatus(leadId, c.id, 'paid'), 'Commission marked paid')}
              >
                Mark paid
              </button>
            </div>
          )}
        </div>
      ))}
      <Field label="Required documents" wide>
        <textarea rows={2} value={f.documents} onChange={set('documents')} placeholder="Agreement of sale, payment schedule, KYC" />
      </Field>
      <Field label="Closure notes" wide>
        <textarea rows={2} value={f.notes} onChange={set('notes')} />
      </Field>
      <div className="note-actions">
        <button
          disabled={busy || !f.listingId || !f.finalValue.trim() || lead.status === 'Dropped'}
          onClick={() => {
            if (!isClosed && !window.confirm(`Mark the deal with ${lead.name} closed? The client is emailed.`)) return;
            run(() => api.journey.closeDeal(leadId, f), isClosed ? 'Closure details saved' : `Deal closed${emailNote || ' — client emailed'}`);
          }}
        >
          {isClosed ? 'Save closure details' : 'Mark deal closed'}
        </button>
      </div>
    </Stage>
  );
}

/* 12. HANDOVER ------------------------------------------------------------ */

function HandoverStage({ data, leadId, run, busy, emailNote }) {
  const { lead, deal } = data;
  const [f, setF] = useState({
    at: toLocalInput(lead.handover_at),
    location: lead.handover_location || '',
    instructions: lead.handover_instructions || '',
    notes: lead.handover_notes || '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const status = lead.handover_completed_at ? 'Completed' : lead.handover_at ? 'Scheduled' : 'Not scheduled';

  return (
    <Stage n={12} id="stage-12" title="Handover" done={Boolean(lead.handover_completed_at)}>
      {lead.status !== 'Closed' ? (
        <div className="muted">Close the deal first — the handover is scheduled after that.</div>
      ) : (
        <>
          <div className="journey-facts">
            <span>Project: <strong>{deal?.listing_title || '—'}</strong>{deal?.unit ? `, ${deal.unit}` : ''}</span>
            <span className={'journey-chip ' + (lead.handover_completed_at ? 'completed' : lead.handover_at ? 'scheduled' : '')}>{status}</span>
            {lead.handover_completed_at && <span className="muted">Completed {stamp(lead.handover_completed_at)} — post-handover email sent, feedback request follows.</span>}
          </div>
          {!lead.handover_completed_at && (
            <>
              <div className="req-grid">
                <Field label="Handover date & time">
                  <input type="datetime-local" value={f.at} onChange={set('at')} />
                </Field>
                <Field label="Handover location">
                  <input value={f.location} onChange={set('location')} placeholder="Site office, Tower B" />
                </Field>
              </div>
              <Field label="Documents & instructions (emailed to the client)" wide>
                <textarea rows={2} value={f.instructions} onChange={set('instructions')} placeholder="Bring ID proof, allotment letter and the final payment receipt." />
              </Field>
              <Field label="Internal notes" wide>
                <textarea rows={2} value={f.notes} onChange={set('notes')} />
              </Field>
              <div className="note-actions">
                <button
                  disabled={busy || !f.at}
                  onClick={() =>
                    run(
                      () => api.journey.scheduleHandover(leadId, { ...f, at: isoOrNull(f.at) }),
                      `Handover ${lead.handover_at ? 'updated' : 'scheduled'}${emailNote || ' — client emailed'}`
                    )
                  }
                >
                  {lead.handover_at ? 'Update handover' : 'Schedule handover'}
                </button>
                {lead.handover_at && (
                  <button
                    className="ghost"
                    disabled={busy}
                    onClick={() => run(() => api.journey.completeHandover(leadId), `Handover completed${emailNote || ' — post-handover email sent'}`)}
                  >
                    Mark handover completed
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </Stage>
  );
}

/* 13. FEEDBACK ------------------------------------------------------------ */

function FeedbackStage({ data }) {
  const { feedback, feedbackRequestedAt, lead } = data;
  const status = feedback ? 'Received' : feedbackRequestedAt ? 'Requested' : 'Not requested';
  return (
    <Stage n={13} id="stage-13" title="Feedback" done={Boolean(feedback)}>
      <div className="journey-facts">
        <span>Status: <strong>{status}</strong></span>
        {feedbackRequestedAt && <span className="muted">Requested {stamp(feedbackRequestedAt)}</span>}
        {feedback && <span className="muted">Received {stamp(feedback.created_at)}</span>}
      </div>
      {feedback ? (
        <>
          <div className="journey-ratings">
            {RATINGS.map(([k, label]) =>
              feedback[k] ? <span key={k} className="journey-chip">{label}: {'★'.repeat(feedback[k])}{'☆'.repeat(5 - feedback[k])}</span> : null
            )}
          </div>
          {feedback.comment && <div className="muted journey-quote">“{feedback.comment}”</div>}
        </>
      ) : (
        <div className="muted">
          {lead.handover_completed_at
            ? 'The feedback request goes out automatically a few days after the handover.'
            : 'Requested automatically a few days after the handover is completed.'}
        </div>
      )}
    </Stage>
  );
}

/* 14. REFERRAL ------------------------------------------------------------ */

function ReferralStage({ data, leadId, run, busy }) {
  const navigate = useNavigate();
  const { referrals, feedback, emails } = data;
  const [f, setF] = useState({ name: '', phone: '', email: '', note: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const asked = emails.some((e) => e.code === 'CL-13');

  return (
    <Stage n={14} id="stage-14" title="Referral" done={referrals.length > 0}>
      <div className="muted">
        {asked
          ? 'Referral request sent after their positive rating.'
          : feedback && feedback.overall < 4
            ? `Rated ${feedback.overall}★ — no referral request is sent below 4★.`
            : 'A client who rates 4★ or 5★ is invited to refer friends, family and colleagues.'}
      </div>
      {referrals.length > 0 && (
        <div className="journey-referrals">
          <span className="muted">Referred by this client:</span>
          {referrals.map((r) => (
            <button key={r.id} className="lv-inline-btn" onClick={() => navigate(`/clients/${r.id}`)}>
              {r.name} · {r.status}
            </button>
          ))}
        </div>
      )}
      <div className="req-grid">
        <Field label="Referred person"><input value={f.name} onChange={set('name')} placeholder="Name" /></Field>
        <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Email"><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Note"><input value={f.note} onChange={set('note')} placeholder="Colleague, wants a 3 BHK" /></Field>
      </div>
      <div className="note-actions">
        <button
          className="ghost"
          disabled={busy || !f.name.trim() || (!f.phone.trim() && !f.email.trim())}
          onClick={() => run(() => api.journey.addReferral(leadId, f), 'Referral recorded — new lead created')}
        >
          Record referral
        </button>
      </div>
    </Stage>
  );
}
