import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { timeAgo } from '../lib/time';

/* The client journey for one client — Founder and Core only.

     outreach -> appointment -> requirement -> shortlist -> site visit
     -> follow-up -> deal -> handover -> feedback -> referral

   Each step here emails the client (server/src/clientJourney.js); site visits
   and the deal itself are moved from the rest of the client page, and email
   the client from there. Rendered inside LeadView, so it borrows its styles. */

const STAMP = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const MODES = { in_person: 'In person', online: 'Online', phone: 'Phone' };

export const EMAIL_NAMES = {
  'CL-01': 'Cold outreach',
  'CL-02': 'Outreach follow-up',
  'CL-03': 'Final follow-up',
  'CL-04': 'Appointment confirmed',
  'CL-05': 'Appointment reminder',
  'CL-06': 'Shortlisted projects',
  'CL-07': 'Site visit confirmed',
  'CL-08': 'Site visit reminder',
  'CL-09': 'Site visit follow-up',
  'CL-10': 'Deal closure',
  'CL-11': 'Handover',
  'CL-12': 'Feedback request',
  'CL-13': 'Referral',
};

const OUTREACH = {
  active: (l) => `Running — email ${l.outreach_step} of 3 sent ${timeAgo(l.outreach_last_at)}. Follow-ups go automatically until they respond.`,
  responded: () => 'They responded — outreach stopped.',
  ended: () => 'No response after the final follow-up — out of the active sequence.',
  stopped: () => 'Stopped by hand.',
};

const RATING_NAMES = {
  communication: 'Communication',
  recommendations: 'Recommendations',
  presentation: 'Presentation',
  site_visit: 'Site visit',
  overall: 'Overall',
};

function toLocalInput(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EMPTY_APPT = { scheduledAt: '', mode: 'in_person', location: '', meetingLink: '', purpose: '' };

export default function ClientJourney({ leadId, onLeadChange }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [verified, setVerified] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const [appt, setAppt] = useState(EMPTY_APPT);
  const [pick, setPick] = useState({ listingId: '', note: '' });
  const [handover, setHandover] = useState({ at: '', location: '', instructions: '' });

  const load = useCallback(async () => {
    try {
      const out = await api.journey.get(leadId);
      setData(out);
      setHandover({
        at: toLocalInput(out.lead.handover_at),
        location: out.lead.handover_location || '',
        instructions: out.lead.handover_instructions || '',
      });
    } catch (err) {
      setError(err.message || 'Could not load the client journey');
    }
  }, [leadId]);

  useEffect(() => {
    load();
  }, [load]);

  /* Verified inventory only: nothing unverified is ever recommended. */
  useEffect(() => {
    api.listings
      .list({ include: 'verified' })
      .then((out) => setVerified((out.listings || []).filter((l) => l.verified)))
      .catch(() => setVerified([]));
  }, []);

  async function run(fn, done) {
    setError('');
    setBusy(true);
    try {
      await fn();
      await load();
      onLeadChange?.();
      if (done) {
        setFlash(done);
        setTimeout(() => setFlash(''), 3000);
      }
    } catch (err) {
      setError(err.message || 'That did not work');
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="section">
        <h3>Client Journey</h3>
        <div className="muted">{error || 'Loading…'}</div>
      </div>
    );
  }

  const { lead, appointments, shortlist, feedback, emails, referrals, emailBlocker } = data;
  const unsent = shortlist.filter((s) => !s.sent_at).length;
  const onList = new Set(shortlist.map((s) => s.listing_id));
  const emailNote = emailBlocker ? ` (not emailed: ${emailBlocker.toLowerCase()})` : '';

  return (
    <>
      <div className="section journey-head">
        <h3>Client Journey</h3>
        <div className="muted">
          Xspace runs this relationship. Each step below emails the client automatically
          {emailBlocker ? '' : ` at ${lead.email}`}.
        </div>
        {emailBlocker && <div className="journey-warn">✉️ {emailBlocker} — steps are recorded but no email is sent.</div>}
        {error && <div className="crm-error">{error}</div>}
        {flash && <div className="saved-flag">{flash}</div>}
      </div>

      {/* 1. OUTREACH */}
      <div className="section">
        <h3>1 · Cold Outreach</h3>
        <div className="muted">
          {lead.outreach_status
            ? OUTREACH[lead.outreach_status]?.(lead)
            : 'Introduce Xspace and ask whether they have a requirement. If they do not respond, a follow-up and then a final follow-up go out automatically, and then the emails stop.'}
        </div>
        <div className="note-actions">
          {!lead.outreach_status && (
            <button disabled={busy || Boolean(emailBlocker)} onClick={() => run(() => api.journey.startOutreach(leadId), 'Outreach email sent')}>
              Start outreach
            </button>
          )}
          {(!lead.outreach_status || lead.outreach_status === 'active') && (
            <button className="ghost" disabled={busy} onClick={() => run(() => api.journey.responded(leadId), 'Marked as responded')}>
              Client responded
            </button>
          )}
          {lead.outreach_status === 'active' && (
            <button className="ghost" disabled={busy} onClick={() => run(() => api.journey.stopOutreach(leadId), 'Outreach stopped')}>
              Stop outreach
            </button>
          )}
        </div>
      </div>

      {/* 2. APPOINTMENTS */}
      <div className="section">
        <h3>2 · Appointments</h3>
        {appointments.length === 0 ? (
          <div className="muted">No appointments yet.</div>
        ) : (
          appointments.map((a) => (
            <div className="timeline-item journey-row" key={a.id}>
              <div>
                <strong>{STAMP.format(new Date(a.scheduled_at))}</strong> · {MODES[a.mode]} ·{' '}
                <span className={'journey-chip ' + a.status}>{a.status}</span>
                <div className="muted">
                  {[a.location, a.meeting_link, a.purpose].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              {a.status === 'scheduled' && (
                <div className="journey-row-actions">
                  <button
                    className="lv-inline-btn"
                    disabled={busy}
                    onClick={() => {
                      const next = window.prompt('New date and time (e.g. 2026-10-20 15:30):', toLocalInput(a.scheduled_at).replace('T', ' '));
                      if (!next) return;
                      const at = new Date(next.trim().replace(' ', 'T'));
                      if (Number.isNaN(at.getTime())) {
                        setError('That date was not understood — use the form YYYY-MM-DD HH:MM');
                        return;
                      }
                      run(() => api.journey.updateAppointment(a.id, { scheduledAt: at.toISOString() }), 'Rescheduled — client emailed');
                    }}
                  >
                    Reschedule
                  </button>
                  <button className="lv-inline-btn" disabled={busy} onClick={() => run(() => api.journey.updateAppointment(a.id, { status: 'completed' }), 'Marked done')}>
                    Done
                  </button>
                  <button className="lv-inline-btn" disabled={busy} onClick={() => run(() => api.journey.updateAppointment(a.id, { status: 'cancelled' }), 'Cancelled')}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))
        )}
        <div className="req-grid">
          <label>
            <span>Date &amp; time</span>
            <input type="datetime-local" value={appt.scheduledAt} onChange={(e) => setAppt({ ...appt, scheduledAt: e.target.value })} />
          </label>
          <label>
            <span>How</span>
            <select value={appt.mode} onChange={(e) => setAppt({ ...appt, mode: e.target.value })}>
              {Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {appt.mode === 'online' ? (
            <label>
              <span>Meeting link</span>
              <input value={appt.meetingLink} onChange={(e) => setAppt({ ...appt, meetingLink: e.target.value })} placeholder="https://meet.google.com/…" />
            </label>
          ) : (
            <label>
              <span>{appt.mode === 'phone' ? 'Number we will call' : 'Location'}</span>
              <input value={appt.location} onChange={(e) => setAppt({ ...appt, location: e.target.value })} placeholder={appt.mode === 'phone' ? 'Client’s number' : 'Xspace office, Kokapet'} />
            </label>
          )}
          <label>
            <span>Purpose</span>
            <input value={appt.purpose} onChange={(e) => setAppt({ ...appt, purpose: e.target.value })} placeholder="Understand your requirement" />
          </label>
        </div>
        <div className="note-actions">
          <button
            disabled={busy || !appt.scheduledAt}
            onClick={() =>
              run(async () => {
                await api.journey.bookAppointment(leadId, { ...appt, scheduledAt: new Date(appt.scheduledAt).toISOString() });
                setAppt(EMPTY_APPT);
              }, `Appointment booked${emailNote || ' — confirmation emailed'}`)
            }
          >
            Book appointment
          </button>
          <span className="muted">A reminder goes out the day before.</span>
        </div>
      </div>

      {/* 4. SHORTLIST */}
      <div className="section">
        <h3>3 · Shortlisted Projects</h3>
        <div className="muted">
          Pick verified projects that fit the requirement above. The client gets a personal
          email with each project, and a private page where they can mark the ones they want to visit.
        </div>
        {shortlist.map((s) => (
          <div className="timeline-item journey-row" key={s.id}>
            <div>
              <strong>{s.title}</strong>
              {s.area ? ` · ${s.area}` : ''}
              {s.price ? ` · ${s.price}` : ''}{' '}
              {s.interested_at ? (
                <span className="journey-chip completed">⭐ Client interested</span>
              ) : s.sent_at ? (
                <span className="journey-chip scheduled">Sent {timeAgo(s.sent_at)}</span>
              ) : (
                <span className="journey-chip">Not sent yet</span>
              )}
              {s.note && <div className="muted">Why: {s.note}</div>}
            </div>
            <div className="journey-row-actions">
              <button className="lv-inline-btn" disabled={busy} onClick={() => run(() => api.journey.removeFromShortlist(leadId, s.id))}>
                Remove
              </button>
            </div>
          </div>
        ))}
        <div className="req-grid">
          <label>
            <span>Verified project</span>
            <select value={pick.listingId} onChange={(e) => setPick({ ...pick, listingId: e.target.value })}>
              <option value="">Select…</option>
              {verified.filter((l) => !onList.has(l.id)).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}{l.area ? ` — ${l.area}` : ''}{l.price ? ` — ${l.price}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Why it suits them (shown to the client)</span>
            <input value={pick.note} onChange={(e) => setPick({ ...pick, note: e.target.value })} placeholder="Within budget, 5 min to ORR" />
          </label>
        </div>
        <div className="note-actions">
          <button
            className="ghost"
            disabled={busy || !pick.listingId}
            onClick={() =>
              run(async () => {
                await api.journey.addToShortlist(leadId, pick.listingId, pick.note);
                setPick({ listingId: '', note: '' });
              })
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
      </div>

      {/* 8. HANDOVER */}
      <div className="section">
        <h3>4 · Deal &amp; Handover</h3>
        {lead.status !== 'Closed' ? (
          <div className="muted">
            When the deal is done, move the client to <strong>Closed</strong> above — they get a
            congratulations email with the next steps. The handover is scheduled here afterwards.
          </div>
        ) : (
          <>
            <div className="muted">
              Deal closed{lead.closed_at ? ` ${STAMP.format(new Date(lead.closed_at))}` : ''}.{' '}
              {lead.handover_completed_at
                ? `Handover completed ${STAMP.format(new Date(lead.handover_completed_at))} — the feedback request follows automatically.`
                : lead.handover_at
                  ? `Handover scheduled for ${STAMP.format(new Date(lead.handover_at))}.`
                  : 'Schedule the handover when the date is fixed.'}
            </div>
            {!lead.handover_completed_at && (
              <>
                <div className="req-grid">
                  <label>
                    <span>Handover date &amp; time</span>
                    <input type="datetime-local" value={handover.at} onChange={(e) => setHandover({ ...handover, at: e.target.value })} />
                  </label>
                  <label>
                    <span>Location</span>
                    <input value={handover.location} onChange={(e) => setHandover({ ...handover, location: e.target.value })} placeholder="Site office, Tower B" />
                  </label>
                </div>
                <label className="journey-wide">
                  <span className="muted">Documents &amp; instructions for the client</span>
                  <textarea
                    rows={3}
                    value={handover.instructions}
                    onChange={(e) => setHandover({ ...handover, instructions: e.target.value })}
                    placeholder="Bring ID proof, allotment letter and the final payment receipt."
                  />
                </label>
                <div className="note-actions">
                  <button
                    disabled={busy || !handover.at}
                    onClick={() =>
                      run(
                        () => api.journey.scheduleHandover(leadId, { ...handover, at: new Date(handover.at).toISOString() }),
                        `Handover ${lead.handover_at ? 'updated' : 'scheduled'}${emailNote || ' — client emailed'}`
                      )
                    }
                  >
                    {lead.handover_at ? 'Update handover' : 'Schedule handover'}
                  </button>
                  {lead.handover_at && (
                    <button className="ghost" disabled={busy} onClick={() => run(() => api.journey.completeHandover(leadId), 'Handover marked complete')}>
                      Mark handover complete
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* 9–10. FEEDBACK & REFERRALS */}
      <div className="section">
        <h3>5 · Feedback &amp; Referrals</h3>
        {feedback ? (
          <div className="journey-ratings">
            {Object.entries(RATING_NAMES).map(([k, label]) =>
              feedback[k] ? (
                <span key={k} className="journey-chip">{label}: {'★'.repeat(feedback[k])}</span>
              ) : null
            )}
            {feedback.comment && <div className="muted">“{feedback.comment}”</div>}
          </div>
        ) : (
          <div className="muted">
            The feedback request goes out automatically a few days after the handover is completed.
            Clients who rate 4★ or more are then invited to refer friends.
          </div>
        )}
        {referrals.length > 0 && (
          <div className="journey-referrals">
            <div className="muted">Referred by this client:</div>
            {referrals.map((r) => (
              <button key={r.id} className="lv-inline-btn" onClick={() => navigate(`/clients/${r.id}`)}>
                {r.name} · {r.status}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* EMAIL HISTORY */}
      <div className="section">
        <h3>Emails to this client</h3>
        {emails.length === 0 ? (
          <div className="muted">Nothing sent yet.</div>
        ) : (
          emails.map((e) => (
            <div className="timeline-item" key={e.id}>
              <div>
                <strong>{EMAIL_NAMES[e.code] || e.code}</strong> — {e.subject}
                {e.status !== 'sent' && (
                  <span className={'journey-chip ' + (e.status === 'failed' ? 'cancelled' : '')}>
                    {e.status === 'logged' ? 'not sent — email delivery is off' : 'failed'}
                  </span>
                )}
              </div>
              <div className="time">{STAMP.format(new Date(e.created_at))}</div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
