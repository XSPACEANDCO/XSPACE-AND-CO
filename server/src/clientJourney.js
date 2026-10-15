import { randomBytes } from 'node:crypto';
import { config } from './config.js';
import { many, one, query } from './db.js';
import { newId, notify, recordAudit } from './helpers.js';
import { sendEmail } from './mailer.js';
import { renderEmail } from './emailTemplates.js';
import { PROPERTY_TYPES, canAdvance } from './leadStatus.js';
import { INTERNAL_ROLES } from './rbac.js';

/* The client journey, and every email a client receives.

     CLIENT ENTERS XSPACE -> cold outreach (CL-01) -> follow-up (CL-02)
       -> final follow-up (CL-03), stopped as soon as they respond
     -> appointment confirmed (CL-04) -> reminder (CL-05)
     -> requirements captured on the lead (no email)
     -> shortlisted projects (CL-06) -> client shows interest on their page
     -> site visit confirmed (CL-07) -> reminder (CL-08)
     -> follow-up after the visit (CL-09): interested / not sure / other options
     -> deal closure (CL-10) -> handover (CL-11)
     -> feedback (CL-12) -> referral (CL-13) -> long-term relationship

   Xspace owns the client relationship, so the steps that start a
   conversation (outreach, appointments, shortlists, handover) are Founder and
   Core actions — routes/journey.js. Site visits and the deal can be moved by
   the realtor as well; the client is emailed either way.

   A client is only ever emailed when their lead has a valid address and they
   have not unsubscribed. Every email carries an unsubscribe link, and is
   deduplicated in email_log, so a scheduled step running twice sends once.

   The client has no login. Links in their emails carry an unguessable token
   (client_links) that opens only their own page: their shortlist, their
   answer to a visit, their feedback form, their referral form, or the
   unsubscribe confirmation. routes/public.js serves those. */

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DAY = 86_400_000;

const portal = (path) => `${config.email.portalUrl}${path}`;
const typeLabel = (key) => PROPERTY_TYPES.find((p) => p.key === key)?.label || null;

/* A link a client can open without logging in. The same open link is reused
   for the same lead and purpose, so a client's shortlist URL stays stable
   while Xspace adds to it. */
export async function clientLink(leadId, kind, refId = null, ttlDays = 180) {
  const existing = await one(
    `SELECT token FROM client_links
      WHERE lead_id = $1 AND kind = $2 AND ref_id IS NOT DISTINCT FROM $3
        AND (expires_at IS NULL OR expires_at > now() + interval '7 days')
      ORDER BY created_at DESC LIMIT 1`,
    [leadId, kind, refId]
  );
  if (existing) return existing.token;
  const token = randomBytes(24).toString('base64url');
  await query(
    `INSERT INTO client_links (token, lead_id, kind, ref_id, expires_at)
     VALUES ($1,$2,$3,$4, CASE WHEN $5::int IS NULL THEN NULL ELSE now() + make_interval(days => $5::int) END)`,
    [token, leadId, kind, refId, ttlDays]
  );
  return token;
}

export const linkUrl = (token) => portal(`/c/${token}`);

export async function loadLead(leadId) {
  const lead = await one('SELECT * FROM leads WHERE id = $1', [leadId]);
  if (lead) lead.property_type_label = typeLabel(lead.property_type);
  return lead;
}

/* Who the client should talk to: a named representative, else the lead's
   owner when that is an Xspace team member. A realtor partner is never
   presented as the client's Xspace contact — the relationship is Xspace's.
   null means the company's own number and address. */
async function repFor(lead, repId = null) {
  const ids = [repId, lead.assigned_to, lead.created_by].filter(Boolean);
  for (const id of ids) {
    const u = await one('SELECT id, name, phone, email, role FROM users WHERE id = $1 AND active', [id]);
    if (u && INTERNAL_ROLES.includes(u.role)) return u;
  }
  return null;
}

/* Whether this client can be emailed at all, and why not. */
export function emailBlocker(lead) {
  if (!lead?.email || !EMAIL_RE.test(lead.email)) return 'This client has no email address';
  if (lead.email_opt_out_at) return 'This client unsubscribed from emails';
  return null;
}

/* Send one client email. Returns the mailer's result, or null when the
   client cannot be emailed. */
async function emailClient(lead, code, ctx, dedupeKey) {
  if (emailBlocker(lead)) return null;
  const unsubscribeUrl = linkUrl(await clientLink(lead.id, 'unsubscribe', null, null));
  const { subject, html, text } = renderEmail(code, { client: lead, ...ctx, unsubscribeUrl });
  return sendEmail({
    leadId: lead.id,
    to: lead.email,
    code,
    dedupeKey: `${code}:${dedupeKey}`,
    subject,
    html,
    text,
  });
}

/* Move a lead forward to `status` if it is not already there or past it. */
export async function advanceLead(leadId, status) {
  const lead = await one('SELECT status FROM leads WHERE id = $1', [leadId]);
  if (lead && canAdvance(lead.status, status)) {
    await query('UPDATE leads SET status = $2, last_interaction_at = now() WHERE id = $1', [leadId, status]);
  }
}

/* Tell the team about something the client did. The lead's owner directly,
   and Founder/Core as a role. */
async function tellTeam(lead, title, body = null) {
  if (lead.assigned_to) await notify({ userId: lead.assigned_to, type: 'lead', title, body });
  for (const role of INTERNAL_ROLES) await notify({ role, type: 'lead', title, body });
}

function safe(name, fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(`[journey] ${name} failed:`, err);
      return undefined;
    }
  };
}

/* --------------------------------------------------------------------------
   1. Client acquisition — cold outreach
   -------------------------------------------------------------------------- */

/* CL-01. One sequence per client: it either ends (responded / three emails
   sent / stopped by hand) or it is running. */
export async function startOutreach(leadId, actorId) {
  const lead = await loadLead(leadId);
  if (!lead) return { error: 'Client not found', status: 404 };
  const blocked = emailBlocker(lead);
  if (blocked) return { error: blocked, status: 409 };
  if (lead.outreach_status) return { error: 'Outreach has already been started for this client', status: 409 };

  const updated = await one(
    `UPDATE leads SET outreach_status = 'active', outreach_step = 1, outreach_last_at = now()
      WHERE id = $1 AND outreach_status IS NULL RETURNING *`,
    [leadId]
  );
  if (!updated) return { error: 'Outreach has already been started for this client', status: 409 };
  await emailClient(lead, 'CL-01', { rep: await repFor(lead, actorId) }, lead.id);
  await recordAudit(`Cold outreach started for ${lead.name}`, actorId, 'lead', lead.id);
  return { lead: updated };
}

/* The client replied: the sequence stops for good. */
export async function outreachResponded(leadId, actorId) {
  const lead = await one(
    `UPDATE leads SET outreach_status = 'responded'
      WHERE id = $1 AND (outreach_status IS NULL OR outreach_status = 'active') RETURNING *`,
    [leadId]
  );
  if (lead) {
    await advanceLead(leadId, 'Contacted');
    await recordAudit(`${lead.name} responded to outreach`, actorId, 'lead', lead.id);
  }
  return lead;
}

export async function stopOutreach(leadId, actorId) {
  const lead = await one(
    `UPDATE leads SET outreach_status = 'stopped' WHERE id = $1 AND outreach_status = 'active' RETURNING *`,
    [leadId]
  );
  if (lead) await recordAudit(`Outreach stopped for ${lead.name}`, actorId, 'lead', lead.id);
  return lead;
}

/* CL-02 after OUTREACH_FOLLOWUP_DAYS without a response, CL-03 the same gap
   later, and then the client leaves the active sequence. */
async function outreachFollowUps() {
  const gap = config.clients.outreachFollowupDays;
  const due = await many(
    `SELECT * FROM leads
      WHERE outreach_status = 'active' AND outreach_step IN (1, 2)
        AND outreach_last_at < now() - make_interval(secs => $1::float * 86400)`,
    [gap]
  );
  for (const lead of due) {
    const next = lead.outreach_step + 1;
    const claimed = await one(
      `UPDATE leads SET outreach_step = $2, outreach_last_at = now(),
              outreach_status = CASE WHEN $2 >= 3 THEN 'ended' ELSE 'active' END
        WHERE id = $1 AND outreach_status = 'active' AND outreach_step = $3 RETURNING *`,
      [lead.id, next, lead.outreach_step]
    );
    if (!claimed) continue;
    lead.property_type_label = typeLabel(lead.property_type);
    await emailClient(lead, next === 2 ? 'CL-02' : 'CL-03', { rep: await repFor(lead) }, lead.id);
    if (next === 3) {
      await recordAudit(`Outreach to ${lead.name} ended after the final follow-up`, null, 'lead', lead.id);
    }
  }
}

/* --------------------------------------------------------------------------
   2. Appointments
   -------------------------------------------------------------------------- */

/* CL-04, on booking and again if the time changes. Booking one means the
   client responded, so outreach stops. */
export const appointmentBooked = safe('appointmentBooked', async (appointmentId, { rescheduled = false } = {}) => {
  const appointment = await one('SELECT * FROM appointments WHERE id = $1', [appointmentId]);
  if (!appointment) return;
  const lead = await loadLead(appointment.lead_id);
  if (!rescheduled) await outreachResponded(lead.id, appointment.created_by);
  await emailClient(
    lead,
    'CL-04',
    { appointment, rep: await repFor(lead, appointment.created_by), rescheduled },
    `${appointment.id}:${new Date(appointment.scheduled_at).getTime()}`
  );
});

/* CL-05: appointments in the next 24 hours. */
async function appointmentReminders() {
  const due = await many(
    `SELECT * FROM appointments
      WHERE status = 'scheduled' AND scheduled_at > now() AND scheduled_at <= now() + interval '24 hours'`
  );
  for (const appointment of due) {
    const lead = await loadLead(appointment.lead_id);
    await emailClient(
      lead,
      'CL-05',
      { appointment, rep: await repFor(lead, appointment.created_by) },
      `${appointment.id}:${new Date(appointment.scheduled_at).getTime()}`
    );
  }
}

/* --------------------------------------------------------------------------
   4. Shortlisted projects
   -------------------------------------------------------------------------- */

/* What a client may see of a listing. Commission, negotiation room, internal
   notes, the submitting partner and the owner's records stay inside. */
export const CLIENT_LISTING_FIELDS = `
  l.id, l.title, l.area, l.village, l.mandal, l.district, l.landmarks,
  l.property_type, l.property_subtype, l.configuration, l.price, l.base_price, l.all_inclusive,
  l.possession, l.builder, l.super_built_up, l.carpet_area, l.facing, l.extent, l.amenities,
  l.rera_number, l.approval, l.bank_approved, l.verified, l.verified_at,
  l.brochure_url, l.floor_plan_url, l.video_link, l.layout_plan_url,
  p.name AS project_name`;

/* Turn a stored link into one that works from an email or a public page. */
export function absoluteUrl(url) {
  if (!url) return null;
  return url.startsWith('/') ? portal(url) : url;
}

export function locationOf(l) {
  return [l.area, l.village, l.mandal, l.district].filter(Boolean).join(', ') || null;
}

/* A shortlisted listing as an email card. */
async function projectCard(item, token) {
  const photo = await one(
    'SELECT id FROM listing_photos WHERE listing_id = $1 ORDER BY created_at LIMIT 1',
    [item.id]
  );
  const amenities = String(item.amenities || '')
    .split('\n')
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 4);
  const verification = [
    item.verified && 'Verified by Xspace',
    item.rera_number && `RERA ${item.rera_number}`,
    item.approval,
    item.bank_approved && `Bank approved: ${item.bank_approved}`,
  ].filter(Boolean);
  return {
    image: photo ? portal(`/api/public/c/${token}/photo/${photo.id}`) : null,
    title: item.project_name && item.project_name !== item.title ? `${item.title} — ${item.project_name}` : item.title,
    subtitle: [locationOf(item), typeLabel(item.property_type), item.configuration].filter(Boolean).join(' · '),
    lines: [
      item.all_inclusive || item.price || item.base_price ? `Price: ${item.all_inclusive || item.price || item.base_price}` : null,
      item.possession ? `Possession: ${item.possession}` : null,
      amenities.length ? `Highlights: ${amenities.join(', ')}` : null,
      verification.length ? `✓ ${verification.join(' · ')}` : null,
      item.note ? `Why we picked it: ${item.note}` : null,
    ].filter(Boolean),
    links: [
      ...(item.brochure_url ? [{ label: 'Brochure', url: absoluteUrl(item.brochure_url) }] : []),
      ...(item.video_link ? [{ label: 'Video', url: absoluteUrl(item.video_link) }] : []),
    ],
  };
}

/* CL-06: send everything on the client's shortlist. Items not sent before are
   marked sent now; the client's page shows every sent item. */
export async function sendShortlist(leadId, actorId) {
  const lead = await loadLead(leadId);
  if (!lead) return { error: 'Client not found', status: 404 };
  const blocked = emailBlocker(lead);
  if (blocked) return { error: blocked, status: 409 };

  const items = await many(
    `SELECT ${CLIENT_LISTING_FIELDS}, s.note, s.sent_at
       FROM lead_shortlist s
       JOIN listings l ON l.id = s.listing_id
       LEFT JOIN projects p ON p.id = l.project_id
      WHERE s.lead_id = $1 AND l.verified
      ORDER BY s.created_at`,
    [leadId]
  );
  if (!items.length) return { error: 'Add at least one verified project to the shortlist first', status: 409 };

  await query('UPDATE lead_shortlist SET sent_at = now() WHERE lead_id = $1 AND sent_at IS NULL', [leadId]);
  const token = await clientLink(lead.id, 'shortlist');
  const projects = [];
  for (const item of items) projects.push(await projectCard(item, token));

  const result = await emailClient(
    lead,
    'CL-06',
    { projects, pageUrl: linkUrl(token), rep: await repFor(lead, actorId) },
    `${lead.id}:${Date.now()}`
  );
  await advanceLead(lead.id, 'Listings Presented');
  await recordAudit(`Shortlist of ${items.length} sent to ${lead.name}`, actorId, 'lead', lead.id);
  return { sent: items.length, email: result?.status || null };
}

/* The client tapped "I'm interested" on their shortlist page. */
export async function shortlistInterest(leadId, itemId) {
  const item = await one(
    `UPDATE lead_shortlist s SET interested_at = COALESCE(s.interested_at, now())
       FROM listings l
      WHERE s.id = $1 AND s.lead_id = $2 AND s.sent_at IS NOT NULL AND l.id = s.listing_id
      RETURNING s.*, l.title`,
    [itemId, leadId]
  );
  if (!item) return null;
  const lead = await loadLead(leadId);
  await tellTeam(lead, `${lead.name} is interested in ${item.title}`, 'From their shortlist — book a site visit.');
  return item;
}

/* --------------------------------------------------------------------------
   5–6. Site visits
   -------------------------------------------------------------------------- */

/* A visit with what the client needs to find it: the project's address, the
   realtor partner if one is taking it, and the Xspace representative. */
async function visitForClient(visitId) {
  const visit = await one(
    `SELECT v.*, li.title AS listing_title, li.area, li.village, li.mandal, li.district, li.landmarks,
            ru.name AS realtor_name, ru.phone AS realtor_phone, ru.role AS assignee_role
       FROM visits v
       LEFT JOIN listings li ON li.id = v.listing_id
       LEFT JOIN users ru ON ru.id = v.assigned_to
      WHERE v.id = $1`,
    [visitId]
  );
  if (!visit || !visit.lead_id) return null;
  visit.address = [locationOf(visit), visit.landmarks && `near ${visit.landmarks}`].filter(Boolean).join(', ') || null;
  if (visit.assignee_role !== 'realtor') {
    visit.realtor_name = null;
    visit.realtor_phone = null;
  }
  const lead = await loadLead(visit.lead_id);
  return { visit, lead, rep: await repFor(lead, visit.rep_id) };
}

const visitKey = (visit) => `${visit.id}:${new Date(visit.scheduled_at).getTime()}`;

export const visitScheduled = safe('visitScheduled', async (visitId, { rescheduled = false } = {}) => {
  const v = await visitForClient(visitId);
  if (!v) return;
  if (!rescheduled) await advanceLead(v.lead.id, 'Visit Scheduled');
  await emailClient(v.lead, 'CL-07', { visit: v.visit, rep: v.rep, rescheduled }, visitKey(v.visit));
});

export async function visitReminderEmail(visitId) {
  const v = await visitForClient(visitId);
  if (!v) return;
  await emailClient(v.lead, 'CL-08', { visit: v.visit, rep: v.rep }, visitKey(v.visit));
}

/* CL-09: what did they think? The answer comes back through their page. */
export const visitCompleted = safe('visitCompleted', async (visitId) => {
  const v = await visitForClient(visitId);
  if (!v) return;
  await advanceLead(v.lead.id, 'Visit Completed');
  const token = await clientLink(v.lead.id, 'visit', v.visit.id, 60);
  await emailClient(v.lead, 'CL-09', { visit: v.visit, rep: v.rep, answerUrl: linkUrl(token) }, v.visit.id);
});

export const VISIT_ANSWERS = {
  interested: 'Interested — wants the next step',
  not_sure: 'Not sure yet',
  not_interested: 'Not interested — wants other options',
};

/* The client's answer to CL-09. Each answer leaves the team something to do:
   the next step, a follow-up later, or a fresh shortlist. */
export async function visitAnswer(leadId, visitId, answer) {
  if (!VISIT_ANSWERS[answer]) return null;
  const visit = await one(
    `UPDATE visits SET client_response = $3, client_responded_at = now()
      WHERE id = $1 AND lead_id = $2 RETURNING *`,
    [visitId, leadId, answer]
  );
  if (!visit) return null;
  const lead = await loadLead(leadId);
  const listing = visit.listing_id ? await one('SELECT title FROM listings WHERE id = $1', [visit.listing_id]) : null;
  const where = listing ? ` after visiting ${listing.title}` : ' after their site visit';
  if (answer === 'not_sure') {
    await query(
      "UPDATE leads SET follow_up_at = COALESCE(follow_up_at, now() + interval '3 days') WHERE id = $1",
      [leadId]
    );
  }
  const next = {
    interested: 'Call them about the next step.',
    not_sure: 'A follow-up has been set for 3 days from now.',
    not_interested: 'Prepare alternative projects for their shortlist.',
  }[answer];
  await tellTeam(lead, `${lead.name}: ${VISIT_ANSWERS[answer]}${where}`, next);
  return visit;
}

/* --------------------------------------------------------------------------
   7–8. Deal and handover — two separate events
   -------------------------------------------------------------------------- */

async function propertyOf(lead) {
  if (!lead.listing_id) return null;
  const l = await one('SELECT title FROM listings WHERE id = $1', [lead.listing_id]);
  return l?.title || null;
}

/* CL-10, when the lead reaches Closed. */
export const dealClosed = safe('dealClosed', async (leadId, actorId) => {
  await query('UPDATE leads SET closed_at = COALESCE(closed_at, now()) WHERE id = $1', [leadId]);
  const lead = await loadLead(leadId);
  await emailClient(lead, 'CL-10', { property: await propertyOf(lead), rep: await repFor(lead, actorId) }, lead.id);
});

/* CL-11, when the handover is scheduled, and again if its time changes. */
export async function scheduleHandover(leadId, { at, location, instructions }, actorId) {
  const before = await loadLead(leadId);
  if (!before) return { error: 'Client not found', status: 404 };
  if (before.status !== 'Closed') return { error: 'Close the deal before scheduling the handover', status: 409 };
  const lead = await one(
    `UPDATE leads SET handover_at = $2, handover_location = $3, handover_instructions = $4,
            handover_completed_at = NULL
      WHERE id = $1 RETURNING *`,
    [leadId, at, location, instructions]
  );
  lead.property_type_label = typeLabel(lead.property_type);
  const rescheduled = Boolean(before.handover_at);
  await emailClient(
    lead,
    'CL-11',
    {
      property: await propertyOf(lead),
      handover: { at: lead.handover_at, location: lead.handover_location, instructions: lead.handover_instructions },
      rep: await repFor(lead, actorId),
      rescheduled,
    },
    `${lead.id}:${new Date(lead.handover_at).getTime()}`
  );
  await recordAudit(`Handover ${rescheduled ? 'rescheduled' : 'scheduled'} for ${lead.name}`, actorId, 'lead', lead.id);
  return { lead };
}

export async function completeHandover(leadId, actorId) {
  const lead = await one(
    `UPDATE leads SET handover_completed_at = now()
      WHERE id = $1 AND handover_at IS NOT NULL AND handover_completed_at IS NULL RETURNING *`,
    [leadId]
  );
  if (lead) await recordAudit(`Handover completed for ${lead.name}`, actorId, 'lead', lead.id);
  return lead;
}

/* --------------------------------------------------------------------------
   9–10. Feedback and referral
   -------------------------------------------------------------------------- */

/* CL-12, FEEDBACK_DELAY_DAYS after the handover, to anyone who has not
   already given feedback. */
async function feedbackRequests() {
  const due = await many(
    `SELECT l.* FROM leads l
      WHERE l.handover_completed_at IS NOT NULL
        AND l.handover_completed_at < now() - make_interval(secs => $1::float * 86400)
        AND NOT EXISTS (SELECT 1 FROM client_feedback f WHERE f.lead_id = l.id)`,
    [config.clients.feedbackDelayDays]
  );
  for (const lead of due) {
    const token = await clientLink(lead.id, 'feedback', null, 60);
    await emailClient(lead, 'CL-12', { feedbackUrl: linkUrl(token) }, lead.id);
  }
}

const RATINGS = ['communication', 'recommendations', 'presentation', 'site_visit', 'overall'];

/* The client's ratings. A happy client (4 or 5 overall) is then invited to
   refer someone — CL-13. */
export async function submitFeedback(leadId, body) {
  const score = (v) => {
    const n = Number.parseInt(v, 10);
    return n >= 1 && n <= 5 ? n : null;
  };
  const r = Object.fromEntries(RATINGS.map((k) => [k, score(body?.[k])]));
  if (!r.overall) return { error: 'Please choose an overall rating' };
  const comment = String(body?.comment || '').trim().slice(0, 2000) || null;

  const saved = await one(
    `INSERT INTO client_feedback (id, lead_id, communication, recommendations, presentation, site_visit, overall, comment)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (lead_id) DO NOTHING RETURNING *`,
    [newId('fb'), leadId, r.communication, r.recommendations, r.presentation, r.site_visit, r.overall, comment]
  );
  if (!saved) return { error: 'Thank you — we already have your feedback' };

  const lead = await loadLead(leadId);
  await tellTeam(lead, `${lead.name} rated Xspace ${r.overall}/5`, comment);
  if (r.overall >= 4) {
    const token = await clientLink(lead.id, 'referral', null, 365);
    await emailClient(lead, 'CL-13', { referralUrl: linkUrl(token) }, lead.id);
  }
  return { feedback: saved };
}

/* Someone the client introduced. They become a new lead, credited to the
   client who referred them, for the team to contact. */
export async function submitReferral(leadId, body) {
  const name = String(body?.name || '').trim().slice(0, 120);
  const phone = String(body?.phone || '').trim().slice(0, 30) || null;
  const email = String(body?.email || '').trim().toLowerCase().slice(0, 200) || null;
  const note = String(body?.note || '').trim().slice(0, 1000) || null;
  if (!name) return { error: "Please give your friend's name" };
  if (!phone && !email) return { error: 'Please give a phone number or an email address' };
  if (email && !EMAIL_RE.test(email)) return { error: 'That email address does not look right' };

  const referrer = await loadLead(leadId);
  const lead = await one(
    `INSERT INTO leads (id, name, phone, email, source, status, temperature, notes, referred_by)
     VALUES ($1,$2,$3,$4,'Referral','New','warm',$5,$6) RETURNING *`,
    [newId('c'), name, phone, email, `Referred by ${referrer.name}${note ? `: ${note}` : ''}`, leadId]
  );
  for (const role of INTERNAL_ROLES) {
    await notify({ role, type: 'lead', title: `New referral from ${referrer.name}: ${name}`, body: note });
  }
  await recordAudit(`${referrer.name} referred ${name}`, null, 'lead', lead.id);
  return { ok: true };
}

export async function unsubscribe(leadId) {
  const lead = await one(
    'UPDATE leads SET email_opt_out_at = COALESCE(email_opt_out_at, now()) WHERE id = $1 RETURNING *',
    [leadId]
  );
  if (lead) await recordAudit(`${lead.name} unsubscribed from emails`, null, 'lead', lead.id);
  return lead;
}

/* --------------------------------------------------------------------------
   Scheduled steps — run from automations.tick()
   -------------------------------------------------------------------------- */

export async function clientTick() {
  const results = {};
  for (const [name, step] of Object.entries({ outreachFollowUps, appointmentReminders, feedbackRequests })) {
    try {
      await step();
      results[name] = 'ok';
    } catch (err) {
      console.error(`[journey] ${name} failed:`, err);
      results[name] = 'failed';
    }
  }
  return results;
}

export { DAY };
