import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { timeAgo } from '../lib/time';
import { OPEN_VISIT_STATUSES, propertyFullLabel } from '../lib/leadStatus';
import {
  Field, ListingSelect, PersonSelect, Stage, isoOrNull, stamp, toLocalInput,
} from './journeyShared';

/* The client journey, stages 1–7 — Founder and Core only.

     outreach -> appointment -> requirement -> presentation -> shortlist
     -> client review -> site visit

   Stages 8–14 (follow-up to referral) are JourneyDeal.jsx, and the email and
   activity history JourneyHistory.jsx. LeadView loads the data once
   (GET /journey/:id) and hands every section the same `run`, which performs
   a step, reloads, and shows the result. Each step that talks to the client
   emails them automatically — server/src/clientJourney.js. */

const MODES = { in_person: 'In person', online: 'Online', phone: 'Phone' };

/* The outreach states as the CRM names them. */
const OUTREACH_STATUS = {
  null: 'Not started',
  active: 'Sent',
  responded: 'Responded',
  ended: 'No response',
  stopped: 'Stopped',
};
const OUTREACH_EMAILS = [
  ['CL-01', 'Cold outreach email'],
  ['CL-02', 'Follow-up email'],
  ['CL-03', 'Final follow-up / re-engagement'],
];

/* The fourteen steps, and whether each has happened — the strip at the top
   of the journey. */
export function journeySteps(d) {
  const { lead, deal } = d;
  return [
    ['Outreach', Boolean(lead.outreach_status)],
    ['Appointment', d.appointments.some((a) => a.status === 'completed')],
    ['Requirement', Boolean(lead.budget || lead.preferred_area || lead.property_type)],
    ['Presentation', d.presentations.some((p) => p.presented_at)],
    ['Shortlist', d.shortlist.some((s) => s.sent_at)],
    ['Client review', d.shortlist.some((s) => s.interested_at)],
    ['Site visit', d.visits.some((v) => v.status === 'Completed')],
    ['Follow-up', d.followups.length > 0],
    ['Negotiation', Boolean(deal?.negotiation_updated_at)],
    ['Token / EOI', Boolean(deal?.token_status && deal.token_status !== 'cancelled')],
    ['Deal closed', lead.status === 'Closed'],
    ['Handover', Boolean(lead.handover_completed_at)],
    ['Feedback', Boolean(d.feedback)],
    ['Referral', d.referrals.length > 0],
  ];
}

export function JourneyStrip({ data }) {
  const steps = journeySteps(data);
  const next = steps.findIndex(([, done]) => !done);
  return (
    <div className="section">
      <h3>Client Journey</h3>
      <ol className="journey-strip">
        {steps.map(([label, done], i) => (
          <li key={label} className={done ? 'done' : i === next ? 'next' : ''}>
            <a href={`#stage-${i + 1}`}>
              <span className="journey-strip-num">{done ? '✓' : i + 1}</span>
              {label}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

const EMPTY_APPT = { scheduledAt: '', mode: 'in_person', location: '', meetingLink: '', purpose: '', assignedTo: '' };
const EMPTY_PRESENT = { listingId: '', why: '', presentationDate: '', presentedBy: '' };
const EMPTY_VISIT = {
  listingId: '', scheduledAt: '', mode: 'On-site', assignedTo: '', repId: '', meetingPoint: '', mapLink: '',
};

export default function ClientJourney({ data, leadId, listings, run, busy, emailNote, requirement }) {
  const { lead, appointments, presentations, shortlist, visits, emails, team, realtors, emailBlocker } = data;

  const [appt, setAppt] = useState(EMPTY_APPT);
  const [moveAppt, setMoveAppt] = useState({ id: null, at: '' });
  const [present, setPresent] = useState(EMPTY_PRESENT);
  const [pick, setPick] = useState({ listingId: '', note: '' });
  const [visit, setVisit] = useState(EMPTY_VISIT);
  const [moveVisit, setMoveVisit] = useState({ id: null, at: '' });

  const verified = listings.filter((l) => l.verified);
  const unsent = shortlist.filter((s) => !s.sent_at).length;
  const sent = shortlist.filter((s) => s.sent_at);
  const selected = shortlist.filter((s) => s.interested_at);
  const sentAt = (code) => emails.filter((e) => e.code === code).at(-1)?.created_at;

  function bookVisitFor(listingId) {
    setVisit({ ...EMPTY_VISIT, listingId });
    document.getElementById('stage-7')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      {/* 1. OUTREACH */}
      <Stage n={1} id="stage-1" title="Outreach" done={Boolean(lead.outreach_status)}>
        <div className="journey-facts">
          <span>Status: <strong>{OUTREACH_STATUS[lead.outreach_status ?? 'null']}</strong></span>
          {lead.outreach_status === 'active' && (
            <span className="muted">
              Email {lead.outreach_step} of 3 sent {timeAgo(lead.outreach_last_at)} — the next goes automatically if they do not respond.
            </span>
          )}
        </div>
        <div className="journey-comms">
          {OUTREACH_EMAILS.map(([code, label]) => (
            <span key={code} className={'journey-chip' + (sentAt(code) ? ' completed' : '')}>
              {label}{sentAt(code) ? ` · ${stamp(sentAt(code))}` : ''}
            </span>
          ))}
        </div>
        <div className="muted">
          If the client responds, outreach stops. If not, a follow-up and then a final re-engagement email go out on their own.
        </div>
        <div className="note-actions">
          {!lead.outreach_status && (
            <button disabled={busy || Boolean(emailBlocker)} onClick={() => run(() => api.journey.startOutreach(leadId), 'Cold outreach email sent')}>
              Start outreach
            </button>
          )}
          {(!lead.outreach_status || lead.outreach_status === 'active') && (
            <button className="ghost" disabled={busy} onClick={() => run(() => api.journey.responded(leadId), 'Marked as responded — outreach stopped')}>
              Client responded
            </button>
          )}
          {lead.outreach_status === 'active' && (
            <button className="ghost" disabled={busy} onClick={() => run(() => api.journey.stopOutreach(leadId), 'Outreach stopped')}>
              Stop outreach
            </button>
          )}
        </div>
      </Stage>

      {/* 2. APPOINTMENTS */}
      <Stage n={2} id="stage-2" title="Appointments" done={appointments.some((a) => a.status === 'completed')}>
        {appointments.length === 0 && <div className="muted">No appointments yet.</div>}
        {appointments.map((a) => (
          <div className="timeline-item journey-row" key={a.id}>
            <div>
              <strong>{stamp(a.scheduled_at)}</strong> · {MODES[a.mode]}{' '}
              <span className={'journey-chip ' + a.status}>{a.status}</span>
              <div className="muted">
                {[a.location, a.meeting_link, a.purpose].filter(Boolean).join(' · ') || '—'}
                {a.assigned_to_name ? ` · with ${a.assigned_to_name}` : ''}
              </div>
              {moveAppt.id === a.id && (
                <div className="journey-inline">
                  <input type="datetime-local" value={moveAppt.at} onChange={(e) => setMoveAppt({ ...moveAppt, at: e.target.value })} />
                  <button
                    className="lv-inline-btn"
                    disabled={busy || !moveAppt.at}
                    onClick={() =>
                      run(() => api.journey.updateAppointment(a.id, { scheduledAt: isoOrNull(moveAppt.at) }), `Rescheduled${emailNote || ' — client emailed'}`)
                        .then((ok) => ok && setMoveAppt({ id: null, at: '' }))
                    }
                  >
                    Save new time
                  </button>
                  <button className="lv-inline-btn" onClick={() => setMoveAppt({ id: null, at: '' })}>Never mind</button>
                </div>
              )}
            </div>
            {a.status === 'scheduled' && moveAppt.id !== a.id && (
              <div className="journey-row-actions">
                <button className="lv-inline-btn" disabled={busy} onClick={() => setMoveAppt({ id: a.id, at: toLocalInput(a.scheduled_at) })}>
                  Reschedule
                </button>
                <button className="lv-inline-btn" disabled={busy} onClick={() => run(() => api.journey.updateAppointment(a.id, { status: 'completed' }), 'Appointment completed')}>
                  Mark completed
                </button>
                <button
                  className="lv-inline-btn"
                  disabled={busy}
                  onClick={() => window.confirm('Cancel this appointment?') && run(() => api.journey.updateAppointment(a.id, { status: 'cancelled' }), 'Appointment cancelled')}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}
        <div className="req-grid">
          <Field label="Date & time">
            <input type="datetime-local" value={appt.scheduledAt} onChange={(e) => setAppt({ ...appt, scheduledAt: e.target.value })} />
          </Field>
          <Field label="Meeting type">
            <select value={appt.mode} onChange={(e) => setAppt({ ...appt, mode: e.target.value })}>
              {Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          {appt.mode === 'online' ? (
            <Field label="Meeting link">
              <input value={appt.meetingLink} onChange={(e) => setAppt({ ...appt, meetingLink: e.target.value })} placeholder="https://meet.google.com/…" />
            </Field>
          ) : (
            <Field label={appt.mode === 'phone' ? 'Number we will call' : 'Location'}>
              <input value={appt.location} onChange={(e) => setAppt({ ...appt, location: e.target.value })} placeholder={appt.mode === 'phone' ? 'Client’s number' : 'Xspace office, Kokapet'} />
            </Field>
          )}
          <Field label="Purpose">
            <input value={appt.purpose} onChange={(e) => setAppt({ ...appt, purpose: e.target.value })} placeholder="Understand your requirement" />
          </Field>
          <Field label="Xspace team member">
            <PersonSelect value={appt.assignedTo} onChange={(v) => setAppt({ ...appt, assignedTo: v })} people={team} empty="Me" />
          </Field>
        </div>
        <div className="note-actions">
          <button
            disabled={busy || !appt.scheduledAt}
            onClick={() =>
              run(
                () => api.journey.bookAppointment(leadId, { ...appt, scheduledAt: isoOrNull(appt.scheduledAt), assignedTo: appt.assignedTo || undefined }),
                `Appointment booked${emailNote || ' — confirmation emailed'}`
              ).then((ok) => ok && setAppt(EMPTY_APPT))
            }
          >
            Book appointment
          </button>
          <span className="muted">Confirmation now, reminder the day before.</span>
        </div>
      </Stage>

      {/* 3. REQUIREMENT — LeadView owns the form, since it edits the lead itself. */}
      {requirement}

      {/* 4. PROJECT / LISTING PRESENTATION */}
      <Stage n={4} id="stage-4" title="Project / Listing Presentation" done={presentations.some((p) => p.presented_at)}>
        <div className="muted">Projects Xspace walks the client through, based on the requirement. Marking one presented moves the client to Listings Presented.</div>
        {presentations.map((p) => (
          <div className="timeline-item journey-row" key={p.id}>
            <div>
              <strong>{p.title}</strong>
              {[p.area, p.configuration, propertyFullLabel(p.property_type), p.price].filter(Boolean).map((x) => ` · ${x}`)}{' '}
              {p.presented_at
                ? <span className="journey-chip completed">Presented {stamp(p.presentation_date || p.presented_at)}</span>
                : <span className="journey-chip scheduled">{p.presentation_date ? `Planned ${stamp(p.presentation_date)}` : 'To present'}</span>}
              {p.why && <div className="muted">Why it suits: {p.why}</div>}
              {p.presented_by_name && <div className="muted">Presented by {p.presented_by_name}</div>}
            </div>
            <div className="journey-row-actions">
              {!p.presented_at && (
                <button className="lv-inline-btn" disabled={busy} onClick={() => run(() => api.journey.markPresented(p.id), 'Marked as presented')}>
                  Mark as presented
                </button>
              )}
              <button className="lv-inline-btn" disabled={busy} onClick={() => run(() => api.journey.removePresentation(leadId, p.id))}>
                Remove
              </button>
            </div>
          </div>
        ))}
        <div className="req-grid">
          <Field label="Project">
            <ListingSelect value={present.listingId} onChange={(v) => setPresent({ ...present, listingId: v })} listings={listings} exclude={new Set(presentations.map((p) => p.listing_id))} />
          </Field>
          <Field label="Why it suits the client">
            <input value={present.why} onChange={(e) => setPresent({ ...present, why: e.target.value })} placeholder="In budget, 10 min from office" />
          </Field>
          <Field label="Presentation date">
            <input type="datetime-local" value={present.presentationDate} onChange={(e) => setPresent({ ...present, presentationDate: e.target.value })} />
          </Field>
          <Field label="Presented by">
            <PersonSelect value={present.presentedBy} onChange={(v) => setPresent({ ...present, presentedBy: v })} people={team} empty="Me" />
          </Field>
        </div>
        <div className="note-actions">
          <button
            className="ghost"
            disabled={busy || !present.listingId}
            onClick={() =>
              run(() =>
                api.journey.addPresentation(leadId, {
                  ...present,
                  presentationDate: isoOrNull(present.presentationDate),
                  presentedBy: present.presentedBy || undefined,
                }), 'Project added'
              ).then((ok) => ok && setPresent(EMPTY_PRESENT))
            }
          >
            Add project
          </button>
        </div>
      </Stage>

      {/* 5. SHORTLISTED PROJECTS */}
      <Stage n={5} id="stage-5" title="Shortlisted Projects" done={sent.length > 0}>
        <div className="muted">
          Verified projects only. The client is emailed each one and gets a private page to pick the ones they want to visit — no access to the CRM.
        </div>
        <div className="shortlist-cards">
          {shortlist.map((s) => (
            <div className="shortlist-card" key={s.id}>
              <div className="shortlist-card-head">
                <strong>{s.title}</strong>
                {s.interested_at ? (
                  <span className="journey-chip completed">⭐ Client selected</span>
                ) : s.sent_at ? (
                  <span className="journey-chip scheduled">Sent {timeAgo(s.sent_at)}</span>
                ) : (
                  <span className="journey-chip">Not sent yet</span>
                )}
              </div>
              <dl className="shortlist-facts">
                <dt>Location</dt><dd>{[s.area, s.village, s.mandal, s.district].filter(Boolean).join(', ') || '—'}</dd>
                <dt>Type</dt><dd>{propertyFullLabel(s.property_type) || '—'}</dd>
                <dt>Price</dt><dd>{s.all_inclusive || s.price || s.base_price || '—'}</dd>
                <dt>Configuration</dt><dd>{s.configuration || '—'}</dd>
                <dt>Verification</dt><dd>{s.verified ? '✓ Verified by Xspace' : 'Not verified'}</dd>
              </dl>
              {s.note && <div className="muted">Why it suits: {s.note}</div>}
              <div className="journey-row-actions">
                <Link className="lv-inline-btn as-link" to={`/listings/${s.listing_id}`}>Project details</Link>
                {s.brochure_url && <a className="lv-inline-btn as-link" href={s.brochure_url} target="_blank" rel="noreferrer">Brochure</a>}
                {s.photos > 0 && <span className="muted">{s.photos} image{s.photos === 1 ? '' : 's'}</span>}
                <button className="lv-inline-btn" disabled={busy} onClick={() => run(() => api.journey.removeFromShortlist(leadId, s.id), 'Removed from shortlist')}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="req-grid">
          <Field label="Verified project">
            <ListingSelect value={pick.listingId} onChange={(v) => setPick({ ...pick, listingId: v })} listings={verified} exclude={new Set(shortlist.map((s) => s.listing_id))} empty="Select…" />
          </Field>
          <Field label="Why it suits them (shown to the client)">
            <input value={pick.note} onChange={(e) => setPick({ ...pick, note: e.target.value })} placeholder="Within budget, 5 min to ORR" />
          </Field>
        </div>
        <div className="note-actions">
          <button
            className="ghost"
            disabled={busy || !pick.listingId}
            onClick={() =>
              run(() => api.journey.addToShortlist(leadId, pick.listingId, pick.note), 'Added to shortlist')
                .then((ok) => ok && setPick({ listingId: '', note: '' }))
            }
          >
            Add to shortlist
          </button>
          <button
            disabled={busy || shortlist.length === 0 || Boolean(emailBlocker)}
            onClick={() => {
              if (window.confirm(`Email ${shortlist.length} shortlisted project(s) to ${lead.name}?`)) {
                run(() => api.journey.sendShortlist(leadId), 'Shortlist emailed to the client');
              }
            }}
          >
            {unsent > 0 && shortlist.length > unsent ? `Send shortlist (${unsent} new)` : 'Send shortlist to client'}
          </button>
        </div>
      </Stage>

      {/* 6. CLIENT PROJECT REVIEW */}
      <Stage n={6} id="stage-6" title="Client Project Review" done={selected.length > 0}>
        {sent.length === 0 ? (
          <div className="muted">Once the shortlist is sent, the client’s selections from their private review page appear here.</div>
        ) : selected.length === 0 ? (
          <div className="muted">
            Shortlist sent {timeAgo(sent.at(-1).sent_at)} — {sent.length} project{sent.length === 1 ? '' : 's'}. The client has not selected any yet.
          </div>
        ) : (
          selected.map((s) => (
            <div className="timeline-item journey-row" key={s.id}>
              <div>
                <strong>⭐ {s.title}</strong>
                <div className="muted">Selected by the client {timeAgo(s.interested_at)}</div>
              </div>
              <div className="journey-row-actions">
                <button className="lv-inline-btn" onClick={() => bookVisitFor(s.listing_id)}>Schedule site visit</button>
              </div>
            </div>
          ))
        )}
      </Stage>

      {/* 7. SITE VISITS */}
      <Stage n={7} id="stage-7" title="Site Visits" done={visits.some((v) => v.status === 'Completed')}>
        {visits.length === 0 && <div className="muted">No site visits yet.</div>}
        {visits.map((v) => (
          <div className="timeline-item journey-row" key={v.id}>
            <div>
              <strong>{v.listing_title || 'No project linked'}</strong> · {stamp(v.scheduled_at)}{' '}
              <span className={'journey-chip ' + visitTone(v.status)}>{v.status}</span>
              <div className="muted">
                {[v.mode, v.listing_area, v.meeting_point && `meet at ${v.meeting_point}`].filter(Boolean).join(' · ')}
              </div>
              <div className="muted">
                Realtor partner: {v.realtor_name || '—'} · Xspace representative: {v.rep_name || '—'}
              </div>
              {v.reason && <div className="muted">Reason: {v.reason}</div>}
              {v.feedback && <div className="muted">Feedback: {v.feedback}</div>}
              {v.client_response && <div className="muted">Client said: {v.client_response.replace('_', ' ')}</div>}
              {moveVisit.id === v.id && (
                <div className="journey-inline">
                  <input type="datetime-local" value={moveVisit.at} onChange={(e) => setMoveVisit({ ...moveVisit, at: e.target.value })} />
                  <button
                    className="lv-inline-btn"
                    disabled={busy || !moveVisit.at}
                    onClick={() =>
                      run(() => api.visits.reschedule(v.id, isoOrNull(moveVisit.at)), `Visit rescheduled${emailNote || ' — client emailed'}`)
                        .then((ok) => ok && setMoveVisit({ id: null, at: '' }))
                    }
                  >
                    Save new time
                  </button>
                  <button className="lv-inline-btn" onClick={() => setMoveVisit({ id: null, at: '' })}>Never mind</button>
                </div>
              )}
            </div>
            {OPEN_VISIT_STATUSES.includes(v.status) && moveVisit.id !== v.id && (
              <div className="journey-row-actions">
                {v.status !== 'Confirmed' && (
                  <button className="lv-inline-btn" disabled={busy} onClick={() => run(() => api.visits.confirm(v.id), 'Visit confirmed')}>
                    Confirm
                  </button>
                )}
                <button className="lv-inline-btn" disabled={busy} onClick={() => setMoveVisit({ id: v.id, at: toLocalInput(v.scheduled_at) })}>
                  Reschedule
                </button>
                <button
                  className="lv-inline-btn"
                  disabled={busy}
                  onClick={() => {
                    const feedback = window.prompt('How did the visit go? (optional)', '');
                    if (feedback !== null) run(() => api.visits.complete(v.id, feedback.trim()), 'Visit completed — follow-up email sent');
                  }}
                >
                  Mark completed
                </button>
                <button
                  className="lv-inline-btn"
                  disabled={busy}
                  onClick={() => {
                    const reason = window.prompt(
                      'Cancel this visit? The client is emailed that it is off.\nReason (internal, not sent to the client — optional):',
                      ''
                    );
                    if (reason !== null) run(() => api.visits.cancel(v.id, reason.trim()), `Visit cancelled${emailNote || ' — client emailed'}`);
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}
        <div className="req-grid">
          <Field label="Project">
            <ListingSelect value={visit.listingId} onChange={(id) => setVisit({ ...visit, listingId: id })} listings={verified} />
          </Field>
          <Field label="Date & time">
            <input type="datetime-local" value={visit.scheduledAt} onChange={(e) => setVisit({ ...visit, scheduledAt: e.target.value })} />
          </Field>
          <Field label="Mode">
            <select value={visit.mode} onChange={(e) => setVisit({ ...visit, mode: e.target.value })}>
              <option>On-site</option>
              <option>VR</option>
            </select>
          </Field>
          <Field label="Realtor partner">
            <PersonSelect value={visit.assignedTo} onChange={(id) => setVisit({ ...visit, assignedTo: id })} people={realtors} empty="None — Xspace takes it" />
          </Field>
          <Field label="Xspace representative">
            <PersonSelect value={visit.repId} onChange={(id) => setVisit({ ...visit, repId: id })} people={team} empty="Me" />
          </Field>
          <Field label="Meeting point (sent to the client)">
            <input value={visit.meetingPoint} onChange={(e) => setVisit({ ...visit, meetingPoint: e.target.value })} placeholder="Main gate, sales office" />
          </Field>
          <Field label="Map link (sent to the client)">
            <input value={visit.mapLink} onChange={(e) => setVisit({ ...visit, mapLink: e.target.value })} placeholder="https://maps.app.goo.gl/…" />
          </Field>
        </div>
        <div className="note-actions">
          <button
            disabled={busy || !visit.scheduledAt || !visit.listingId}
            onClick={() =>
              run(
                () =>
                  api.visits.create({
                    leadId,
                    listingId: visit.listingId,
                    scheduledAt: isoOrNull(visit.scheduledAt),
                    mode: visit.mode,
                    assignedTo: visit.assignedTo || undefined,
                    repId: visit.repId || undefined,
                    meetingPoint: visit.meetingPoint.trim() || null,
                    mapLink: visit.mapLink.trim() || null,
                  }),
                `Site visit scheduled${emailNote || ' — confirmation emailed'}`
              ).then((ok) => ok && setVisit(EMPTY_VISIT))
            }
          >
            Schedule visit
          </button>
          <span className="muted">Confirmation now, reminder the day before, follow-up after it is completed.</span>
        </div>
      </Stage>
    </>
  );
}

function visitTone(status) {
  if (status === 'Completed' || status === 'Confirmed') return 'completed';
  if (status === 'Cancelled' || status === 'Unsuccessful') return 'cancelled';
  return 'scheduled';
}
