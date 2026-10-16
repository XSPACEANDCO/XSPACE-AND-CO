import { Router } from 'express';
import { many, one } from '../db.js';
import { asyncHandler, requireModule, requirePermission } from '../middleware.js';
import { newId, notify, parseDate, recordAudit, safeUrl } from '../helpers.js';
import { FOLLOW_UP_TYPES, TOKEN_STATUSES, canAdvance } from '../leadStatus.js';
import * as journey from '../clientJourney.js';
import { commissionAmount } from '../money.js';

/* The client journey desk for one client at a time — outreach, appointments,
   project presentation, shortlist, follow-ups, negotiation, token / EOI,
   closure, handover, feedback, referral and the activity history. See
   src/clientJourney.js.

   Founder and Core only. Xspace owns the client relationship: a realtor
   partner works a lead but does not start conversations with the client in
   Xspace's name. leads:assign is the internal-only lead permission. */
const router = Router();
router.use(requireModule('crm'), requirePermission('leads:assign'));

async function findLead(req, res) {
  const lead = await journey.loadLead(req.params.leadId);
  if (!lead) res.status(404).json({ error: 'Client not found' });
  return lead;
}

const send = (res, out) => (out.error ? res.status(out.status || 400).json({ error: out.error }) : res.json(out));

/* Everything about the client's journey on one screen. */
router.get(
  '/:leadId',
  asyncHandler(async (req, res) => {
    const lead = await findLead(req, res);
    if (!lead) return;
    const id = lead.id;
    const [
      owner, appointments, presentations, shortlist, visits, followups, deal,
      feedback, feedbackAsked, emails, referrals, activity, team, realtors, commissions,
    ] = await Promise.all([
      lead.assigned_to ? one('SELECT name FROM users WHERE id = $1', [lead.assigned_to]) : null,
      many(
        `SELECT a.*, u.name AS assigned_to_name FROM appointments a
           LEFT JOIN users u ON u.id = a.assigned_to
          WHERE a.lead_id = $1 ORDER BY a.scheduled_at DESC`,
        [id]
      ),
      many(
        `SELECT p.*, l.title, l.area, l.price, l.configuration, l.property_type, u.name AS presented_by_name
           FROM lead_presentations p
           JOIN listings l ON l.id = p.listing_id
           LEFT JOIN users u ON u.id = p.presented_by
          WHERE p.lead_id = $1 ORDER BY p.created_at`,
        [id]
      ),
      many(
        `SELECT s.*, l.title, l.area, l.village, l.mandal, l.district, l.price, l.base_price, l.all_inclusive,
                l.property_type, l.configuration, l.verified, l.brochure_url,
                (SELECT COUNT(*)::int FROM listing_photos ph WHERE ph.listing_id = l.id) AS photos
           FROM lead_shortlist s
           JOIN listings l ON l.id = s.listing_id
          WHERE s.lead_id = $1 ORDER BY s.created_at`,
        [id]
      ),
      many(
        `SELECT v.*, li.title AS listing_title, li.area AS listing_area,
                ru.name AS realtor_name, ru.role AS assignee_role, rp.name AS rep_name
           FROM visits v
           LEFT JOIN listings li ON li.id = v.listing_id
           LEFT JOIN users ru ON ru.id = v.assigned_to
           LEFT JOIN users rp ON rp.id = v.rep_id
          WHERE v.lead_id = $1 ORDER BY v.scheduled_at DESC NULLS LAST`,
        [id]
      ),
      many(
        `SELECT f.*, u.name AS created_by_name FROM lead_followups f
           LEFT JOIN users u ON u.id = f.created_by
          WHERE f.lead_id = $1 ORDER BY f.happened_at DESC`,
        [id]
      ),
      one(
        `SELECT d.*, l.title AS listing_title, o.name AS xspace_owner_name, r.name AS realtor_partner_name
           FROM lead_deals d
           LEFT JOIN listings l ON l.id = d.listing_id
           LEFT JOIN users o ON o.id = d.xspace_owner
           LEFT JOIN users r ON r.id = d.realtor_partner
          WHERE d.lead_id = $1`,
        [id]
      ),
      one('SELECT * FROM client_feedback WHERE lead_id = $1', [id]),
      one("SELECT min(created_at) AS at FROM email_log WHERE lead_id = $1 AND code = 'CL-12'", [id]),
      many(
        `SELECT id, code, subject, status, error, created_at FROM email_log
          WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [id]
      ),
      many('SELECT id, name, status, created_at FROM leads WHERE referred_by = $1 ORDER BY created_at DESC', [id]),
      many(
        `SELECT a.id, a.text, a.created_at, u.name AS actor_name FROM audit_log a
           LEFT JOIN users u ON u.id = a.actor_id
          WHERE a.entity = 'lead' AND a.entity_id = $1
          ORDER BY a.created_at DESC LIMIT 200`,
        [id]
      ),
      many("SELECT id, name, role FROM users WHERE active AND role IN ('founder','core') ORDER BY name"),
      many("SELECT id, name FROM users WHERE active AND role = 'realtor' ORDER BY name"),
      many(
        `SELECT c.*, u.name AS partner_name FROM commissions c
           LEFT JOIN users u ON u.id = c.user_id
          WHERE c.lead_id = $1 ORDER BY c.created_at`,
        [id]
      ),
    ]);

    /* Whoever a visit is assigned to is shown as the realtor partner only
       when they are one. */
    for (const v of visits) if (v.assignee_role !== 'realtor') v.realtor_name = null;

    res.json({
      lead: { ...lead, assigned_to_name: owner?.name || null },
      emailBlocker: journey.emailBlocker(lead),
      appointments,
      presentations,
      shortlist,
      visits,
      followups,
      deal,
      feedback,
      feedbackRequestedAt: feedbackAsked?.at || null,
      emails,
      referrals,
      activity,
      team,
      realtors,
      commissions,
    });
  })
);

/* A user id that must be an active Founder/Core member, or with
   kind 'realtor' an active realtor partner. Empty is fine and means nobody.
   Returns an error message or null. */
async function checkUser(userId, kind = 'internal') {
  if (!userId) return null;
  const roles = kind === 'realtor' ? ['realtor'] : ['founder', 'core'];
  const u = await one('SELECT id FROM users WHERE id = $1 AND active AND role = ANY($2)', [userId, roles]);
  if (u) return null;
  return kind === 'realtor' ? 'Pick an active realtor partner' : 'Pick an active Founder or Core member';
}

const text = (v, max = 2000) => String(v ?? '').trim().slice(0, max) || null;

/* ---------- 1. Cold outreach ---------- */

router.post(
  '/:leadId/outreach/start',
  asyncHandler(async (req, res) => send(res, await journey.startOutreach(req.params.leadId, req.user.id)))
);

router.post(
  '/:leadId/outreach/responded',
  asyncHandler(async (req, res) => {
    const lead = await journey.outreachResponded(req.params.leadId, req.user.id);
    if (!lead) return res.status(409).json({ error: 'There is no outreach running for this client' });
    res.json({ lead });
  })
);

router.post(
  '/:leadId/outreach/stop',
  asyncHandler(async (req, res) => {
    const lead = await journey.stopOutreach(req.params.leadId, req.user.id);
    if (!lead) return res.status(409).json({ error: 'There is no outreach running for this client' });
    res.json({ lead });
  })
);

/* ---------- 2. Appointments ---------- */

const MODES = ['in_person', 'online', 'phone'];

function appointmentFields(body) {
  const meetingLink = safeUrl(body.meetingLink);
  if (meetingLink === undefined) return { error: 'The meeting link must start with http:// or https://' };
  if (body.mode && !MODES.includes(body.mode)) return { error: 'Unknown appointment type' };
  return {
    meetingLink,
    mode: body.mode || 'in_person',
    location: String(body.location || '').trim() || null,
    purpose: String(body.purpose || '').trim() || null,
  };
}

router.post(
  '/:leadId/appointments',
  asyncHandler(async (req, res) => {
    const lead = await findLead(req, res);
    if (!lead) return;
    const scheduledAt = parseDate(req.body?.scheduledAt);
    if (!scheduledAt) return res.status(400).json({ error: 'A valid date and time is required' });
    const f = appointmentFields(req.body || {});
    if (f.error) return res.status(400).json({ error: f.error });
    const assignedTo = req.body?.assignedTo || req.user.id;
    const userErr = await checkUser(assignedTo);
    if (userErr) return res.status(400).json({ error: userErr });

    const appointment = await one(
      `INSERT INTO appointments (id, lead_id, scheduled_at, mode, location, meeting_link, purpose, created_by, assigned_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [newId('ap'), lead.id, scheduledAt, f.mode, f.location, f.meetingLink, f.purpose, req.user.id, assignedTo]
    );
    await recordAudit('Appointment booked', req.user.id, 'lead', lead.id);
    if (assignedTo !== req.user.id) {
      await notify({ userId: assignedTo, type: 'lead', title: `Appointment with ${lead.name} assigned to you` });
    }
    await journey.appointmentBooked(appointment.id);
    res.status(201).json({ appointment });
  })
);

/* Reschedule, edit, complete or cancel. A new time re-sends CL-04. */
router.patch(
  '/appointments/:id',
  asyncHandler(async (req, res) => {
    const existing = await one('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Appointment not found' });
    const body = req.body || {};
    if (body.status && !['scheduled', 'completed', 'cancelled'].includes(body.status)) {
      return res.status(400).json({ error: 'Unknown status' });
    }
    const scheduledAt = body.scheduledAt ? parseDate(body.scheduledAt) : null;
    if (body.scheduledAt && !scheduledAt) return res.status(400).json({ error: 'A valid date and time is required' });
    const f = appointmentFields({ ...existing, meetingLink: existing.meeting_link, ...body });
    if (f.error) return res.status(400).json({ error: f.error });
    const userErr = await checkUser(body.assignedTo);
    if (userErr) return res.status(400).json({ error: userErr });

    const appointment = await one(
      `UPDATE appointments SET scheduled_at = COALESCE($2, scheduled_at), status = COALESCE($3, status),
              mode = $4, location = $5, meeting_link = $6, purpose = $7,
              assigned_to = COALESCE($8, assigned_to)
        WHERE id = $1 RETURNING *`,
      [existing.id, scheduledAt, body.status || null, f.mode, f.location, f.meetingLink, f.purpose, body.assignedTo || null]
    );
    const moved = scheduledAt && new Date(scheduledAt).getTime() !== new Date(existing.scheduled_at).getTime();
    if (moved && appointment.status === 'scheduled') {
      await recordAudit('Appointment rescheduled', req.user.id, 'lead', appointment.lead_id);
      await journey.appointmentBooked(appointment.id, { rescheduled: true });
    }
    if (body.status && body.status !== existing.status) {
      const what = { completed: 'Appointment completed', cancelled: 'Appointment cancelled', scheduled: 'Appointment reopened' };
      await recordAudit(what[body.status], req.user.id, 'lead', appointment.lead_id);
    }
    res.json({ appointment });
  })
);

/* ---------- 4. Shortlist ---------- */

router.post(
  '/:leadId/shortlist',
  asyncHandler(async (req, res) => {
    const lead = await findLead(req, res);
    if (!lead) return;
    const listing = await one('SELECT id, title, verified FROM listings WHERE id = $1', [req.body?.listingId]);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (!listing.verified) {
      return res.status(409).json({ error: 'Only verified projects can be recommended to a client' });
    }
    const item = await one(
      `INSERT INTO lead_shortlist (id, lead_id, listing_id, note, added_by)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (lead_id, listing_id) DO UPDATE SET note = EXCLUDED.note
       RETURNING *`,
      [newId('sl'), lead.id, listing.id, String(req.body?.note || '').trim() || null, req.user.id]
    );
    await recordAudit(`Project added to shortlist: ${listing.title}`, req.user.id, 'lead', lead.id);
    res.status(201).json({ item });
  })
);

router.delete(
  '/:leadId/shortlist/:itemId',
  asyncHandler(async (req, res) => {
    const item = await one(
      `DELETE FROM lead_shortlist s USING listings l
        WHERE s.id = $1 AND s.lead_id = $2 AND l.id = s.listing_id RETURNING s.id, l.title`,
      [req.params.itemId, req.params.leadId]
    );
    if (!item) return res.status(404).json({ error: 'Not on this shortlist' });
    await recordAudit(`Project removed from shortlist: ${item.title}`, req.user.id, 'lead', req.params.leadId);
    res.json({ deleted: true });
  })
);

router.post(
  '/:leadId/shortlist/send',
  asyncHandler(async (req, res) => send(res, await journey.sendShortlist(req.params.leadId, req.user.id)))
);

/* ---------- 8. Handover ---------- */

router.post(
  '/:leadId/handover',
  asyncHandler(async (req, res) => {
    const at = parseDate(req.body?.at);
    if (!at) return res.status(400).json({ error: 'A valid handover date and time is required' });
    const out = await journey.scheduleHandover(
      req.params.leadId,
      {
        at,
        location: String(req.body?.location || '').trim() || null,
        instructions: String(req.body?.instructions || '').trim() || null,
        notes: String(req.body?.notes || '').trim() || null,
      },
      req.user.id
    );
    send(res, out);
  })
);

router.post(
  '/:leadId/handover/complete',
  asyncHandler(async (req, res) => {
    const lead = await journey.completeHandover(req.params.leadId, req.user.id);
    if (!lead) return res.status(409).json({ error: 'Schedule the handover first' });
    res.json({ lead });
  })
);

/* ---------- Project / listing presentation ---------- */

/* A project Xspace is presenting to the client — in the meeting, before
   anything is shortlisted and emailed. Any listing can be discussed; only a
   verified one can later go on the shortlist. */
router.post(
  '/:leadId/presentations',
  asyncHandler(async (req, res) => {
    const lead = await findLead(req, res);
    if (!lead) return;
    const listing = await one('SELECT id, title FROM listings WHERE id = $1', [req.body?.listingId]);
    if (!listing) return res.status(404).json({ error: 'Pick a project to present' });
    const presentedBy = req.body?.presentedBy || req.user.id;
    const userErr = await checkUser(presentedBy);
    if (userErr) return res.status(400).json({ error: userErr });

    const item = await one(
      `INSERT INTO lead_presentations (id, lead_id, listing_id, why, presentation_date, presented_by, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (lead_id, listing_id) DO UPDATE
         SET why = EXCLUDED.why, presentation_date = EXCLUDED.presentation_date, presented_by = EXCLUDED.presented_by
       RETURNING *`,
      [newId('pr'), lead.id, listing.id, text(req.body?.why), parseDate(req.body?.presentationDate), presentedBy, req.user.id]
    );
    await recordAudit(`Project added for presentation: ${listing.title}`, req.user.id, 'lead', lead.id);
    res.status(201).json({ item });
  })
);

/* Presented: the client has seen it, and the lead is at Listings Presented. */
router.post(
  '/presentations/:id/presented',
  asyncHandler(async (req, res) => {
    const item = await one(
      `UPDATE lead_presentations p
          SET presented_at = COALESCE(p.presented_at, now()),
              presentation_date = COALESCE(p.presentation_date, now())
         FROM listings l
        WHERE p.id = $1 AND l.id = p.listing_id
        RETURNING p.*, l.title`,
      [req.params.id]
    );
    if (!item) return res.status(404).json({ error: 'Presentation not found' });
    await journey.advanceLead(item.lead_id, 'Listings Presented');
    await recordAudit(`Project presented: ${item.title}`, req.user.id, 'lead', item.lead_id);
    res.json({ item });
  })
);

router.delete(
  '/:leadId/presentations/:id',
  asyncHandler(async (req, res) => {
    const item = await one('DELETE FROM lead_presentations WHERE id = $1 AND lead_id = $2 RETURNING id', [
      req.params.id,
      req.params.leadId,
    ]);
    if (!item) return res.status(404).json({ error: 'Presentation not found' });
    res.json({ deleted: true });
  })
);

/* ---------- Follow-up history ---------- */

/* A conversation that happened. Optionally books the next one, which is what
   the CRM list's "Next follow-up" column reads. */
router.post(
  '/:leadId/followups',
  asyncHandler(async (req, res) => {
    const lead = await findLead(req, res);
    if (!lead) return;
    const body = req.body || {};
    if (!FOLLOW_UP_TYPES.includes(body.kind)) return res.status(400).json({ error: 'How did this follow-up happen?' });
    const happenedAt = body.happenedAt ? parseDate(body.happenedAt) : new Date().toISOString();
    if (!happenedAt) return res.status(400).json({ error: 'That date was not understood' });
    const outcome = text(body.outcome, 300);
    if (!outcome && !text(body.notes)) return res.status(400).json({ error: 'Add an outcome or a note' });

    const nextAt = body.nextFollowUpAt ? parseDate(body.nextFollowUpAt) : null;
    if (body.nextFollowUpAt && !nextAt) return res.status(400).json({ error: 'The next follow-up date was not understood' });

    const item = await one(
      `INSERT INTO lead_followups (id, lead_id, happened_at, kind, notes, outcome, next_action, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [newId('fu'), lead.id, happenedAt, body.kind, text(body.notes), outcome, text(body.nextAction, 300), req.user.id]
    );
    /* The follow-up that was owed has now been made. Book the next one if
       given; otherwise clear the one owed, unless it is still to come. */
    await one(
      `UPDATE leads SET last_interaction_at = now(),
              follow_up_at = CASE WHEN $2::timestamptz IS NOT NULL THEN $2::timestamptz
                                  WHEN follow_up_at <= now() + interval '1 hour' THEN NULL
                                  ELSE follow_up_at END,
              follow_up_type = CASE WHEN $2::timestamptz IS NOT NULL THEN $3 ELSE follow_up_type END,
              follow_up_note = CASE WHEN $2::timestamptz IS NOT NULL THEN $4 ELSE follow_up_note END
        WHERE id = $1 RETURNING id`,
      [lead.id, nextAt, body.kind, text(body.nextAction, 300)]
    );
    await journey.advanceLead(lead.id, 'Contacted');
    await recordAudit(`Follow-up added: ${body.kind}${outcome ? ` — ${outcome}` : ''}`, req.user.id, 'lead', lead.id);
    res.status(201).json({ item });
  })
);

/* ---------- Negotiation, token / EOI, closure ---------- */

/* Writes the given columns of the client's one deal row, creating it on
   first use. Only the columns in `cols` change. The keys are this file's own
   literals, never request input, so interpolating them is safe. */
async function saveDeal(leadId, cols, actorId) {
  const keys = Object.keys(cols);
  const values = keys.map((_, i) => `$${i + 3}`).join(', ');
  const updates = keys.map((k) => `${k} = EXCLUDED.${k}`).join(', ');
  return one(
    `INSERT INTO lead_deals (lead_id, updated_by, ${keys.join(', ')}) VALUES ($1, $2, ${values})
     ON CONFLICT (lead_id) DO UPDATE SET ${updates}, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING *`,
    [leadId, actorId, ...keys.map((k) => cols[k])]
  );
}

/* The project and unit the deal is for — shared by all three stages. */
async function dealTarget(body) {
  if (!body.listingId) return { listing_id: null, unit: text(body.unit, 120) };
  const listing = await one('SELECT id FROM listings WHERE id = $1', [body.listingId]);
  if (!listing) return { error: 'That project does not exist' };
  return { listing_id: listing.id, unit: text(body.unit, 120) };
}

router.put(
  '/:leadId/negotiation',
  asyncHandler(async (req, res) => {
    const lead = await findLead(req, res);
    if (!lead) return;
    if (lead.status === 'Dropped') return res.status(409).json({ error: 'This client has been dropped' });
    const body = req.body || {};
    const target = await dealTarget(body);
    if (target.error) return res.status(400).json({ error: target.error });

    const deal = await saveDeal(lead.id, {
      ...target,
      quoted_price: text(body.quotedPrice, 120),
      client_offer: text(body.clientOffer, 120),
      builder_response: text(body.builderResponse, 500),
      current_position: text(body.currentPosition, 500),
      next_action: text(body.nextAction, 500),
      negotiation_notes: text(body.notes),
      negotiation_updated_at: new Date().toISOString(),
    }, req.user.id);
    await journey.advanceLead(lead.id, 'Negotiation');
    await recordAudit('Negotiation updated', req.user.id, 'lead', lead.id);
    res.json({ deal });
  })
);

router.put(
  '/:leadId/token',
  asyncHandler(async (req, res) => {
    const lead = await findLead(req, res);
    if (!lead) return;
    if (lead.status === 'Dropped') return res.status(409).json({ error: 'This client has been dropped' });
    const body = req.body || {};
    const status = body.status || 'pending';
    if (!TOKEN_STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown token status' });
    if (!text(body.amount, 120)) return res.status(400).json({ error: 'Enter the token / EOI amount' });
    const target = await dealTarget(body);
    if (target.error) return res.status(400).json({ error: target.error });
    const date = body.date ? parseDate(body.date) : null;
    if (body.date && !date) return res.status(400).json({ error: 'That date was not understood' });

    const before = await one('SELECT token_status FROM lead_deals WHERE lead_id = $1', [lead.id]);
    const deal = await saveDeal(lead.id, {
      ...target,
      token_amount: text(body.amount, 120),
      token_date: date ? date.slice(0, 10) : null,
      token_status: status,
      token_documents: text(body.documents),
      token_notes: text(body.notes),
      token_updated_at: new Date().toISOString(),
    }, req.user.id);
    if (status !== 'cancelled') await journey.advanceLead(lead.id, 'Token/EOI');
    await recordAudit(
      before?.token_status && before.token_status !== status
        ? `Token / EOI marked ${status}`
        : `Token / EOI recorded (${status})`,
      req.user.id, 'lead', lead.id
    );
    res.json({ deal });
  })
);

/* Mark Deal Closed: the closure record, the Closed status and the client's
   congratulations email (CL-10), in one step. Saving again on a closed deal
   updates the record without emailing the client a second time. */
router.post(
  '/:leadId/deal/close',
  asyncHandler(async (req, res) => {
    const lead = await findLead(req, res);
    if (!lead) return;
    if (lead.status !== 'Closed' && !canAdvance(lead.status, 'Closed')) {
      return res.status(409).json({ error: `A "${lead.status}" client cannot be closed` });
    }
    const body = req.body || {};
    const target = await dealTarget(body);
    if (target.error) return res.status(400).json({ error: target.error });
    if (!target.listing_id) return res.status(400).json({ error: 'Which project is the deal for?' });
    if (!text(body.finalValue, 120)) return res.status(400).json({ error: 'Enter the final deal value' });
    const date = body.closureDate ? parseDate(body.closureDate) : new Date().toISOString();
    if (!date) return res.status(400).json({ error: 'That closure date was not understood' });
    const owner = body.xspaceOwner || lead.assigned_to || req.user.id;
    const userErr = (await checkUser(owner)) || (await checkUser(body.realtorPartner, 'realtor'));
    if (userErr) return res.status(400).json({ error: userErr });
    /* Checked before anything is saved: a commission owed to a partner has
       to be a figure the ledger can hold. */
    let payout = null;
    if (body.realtorPartner && text(body.commission, 120)) {
      payout = commissionAmount(body.commission, body.finalValue);
      if (payout.error) return res.status(400).json({ error: payout.error });
    }

    const deal = await saveDeal(lead.id, {
      ...target,
      final_value: text(body.finalValue, 120),
      closure_date: date.slice(0, 10),
      xspace_owner: owner,
      realtor_partner: body.realtorPartner || null,
      commission: text(body.commission, 120),
      closure_documents: text(body.documents),
      closure_notes: text(body.notes),
    }, req.user.id);

    const wasClosed = lead.status === 'Closed';
    if (wasClosed) {
      await recordAudit('Deal closure details updated', req.user.id, 'lead', lead.id);
    } else {
      await one(
        `UPDATE leads SET status = 'Closed', listing_id = COALESCE($2, listing_id), last_interaction_at = now()
          WHERE id = $1 RETURNING id`,
        [lead.id, target.listing_id]
      );
      await recordAudit('Deal closed', req.user.id, 'lead', lead.id);
      await journey.dealClosed(lead.id, req.user.id);
      if (lead.assigned_to && lead.assigned_to !== req.user.id) {
        await notify({ userId: lead.assigned_to, type: 'lead', title: `Deal closed: ${lead.name}` });
      }
    }
    const commission = await syncCommission(lead, deal, payout?.amount ?? null, req.user.id);
    res.json({ deal, commission, emailed: !wasClosed && !journey.emailBlocker(lead) });
  })
);

/* ---------- Commission ---------- */

const RUPEES = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/* Keep the realtor partner's earnings in step with the closure record.

   One ledger entry per client deal. While it is pending it follows the
   closure: a new amount updates it, a different partner moves it, and
   removing the partner or the commission withdraws it. Once Founder has
   approved or paid it, it is money promised or sent — the closure form no
   longer changes it. Returns the entry the deal now has, or null. */
async function syncCommission(lead, deal, amount, actorId) {
  const settled = await one(
    "SELECT * FROM commissions WHERE lead_id = $1 AND status <> 'pending' ORDER BY created_at LIMIT 1",
    [lead.id]
  );
  if (settled) return settled;

  const partner = amount !== null ? deal.realtor_partner : null;
  /* Anything pending for another partner (or for nobody now) is withdrawn. */
  const withdrawn = await many(
    "DELETE FROM commissions WHERE lead_id = $1 AND status = 'pending' AND user_id IS DISTINCT FROM $2::text RETURNING user_id",
    [lead.id, partner]
  );
  for (const w of withdrawn) {
    await notify({ userId: w.user_id, type: 'commission', title: `Commission withdrawn: ${lead.name}`, body: 'The deal closure no longer names you.' });
  }
  if (!partner) return null;

  const listing = deal.listing_id ? await one('SELECT title FROM listings WHERE id = $1', [deal.listing_id]) : null;
  const ref = [listing?.title, deal.unit].filter(Boolean).join(', ') + ` — ${lead.name}`;
  const note = `Deal value ${deal.final_value}${deal.commission?.trim().endsWith('%') ? ` · ${deal.commission.trim()}` : ''}`;

  const existing = await one(
    "SELECT * FROM commissions WHERE lead_id = $1 AND user_id = $2 AND status = 'pending'",
    [lead.id, partner]
  );
  if (existing) {
    if (Number(existing.amount) === amount && existing.deal_ref === ref && existing.note === note) return existing;
    const updated = await one(
      'UPDATE commissions SET amount = $2, deal_ref = $3, note = $4 WHERE id = $1 RETURNING *',
      [existing.id, amount, ref, note]
    );
    await recordAudit(`Commission updated: ${RUPEES.format(amount)}`, actorId, 'lead', lead.id);
    return updated;
  }
  const created = await one(
    `INSERT INTO commissions (id, user_id, deal_ref, amount, status, note, lead_id)
     VALUES ($1,$2,$3,$4,'pending',$5,$6) RETURNING *`,
    [newId('cm'), partner, ref, amount, note, lead.id]
  );
  await recordAudit(`Commission of ${RUPEES.format(amount)} added to the realtor partner's earnings`, actorId, 'lead', lead.id);
  await notify({ userId: partner, type: 'commission', title: `Commission recorded: ${RUPEES.format(amount)}`, body: `${ref} — pending approval.` });
  return created;
}

/* Approving and paying out are the Founder's decisions. */
router.post(
  '/:leadId/commission/:id/status',
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'founder') return res.status(403).json({ error: 'Only a Founder can approve or pay a commission' });
    const next = req.body?.status;
    const allowed = { approved: ['pending'], paid: ['pending', 'approved'] };
    if (!allowed[next]) return res.status(400).json({ error: 'Status must be approved or paid' });
    const existing = await one('SELECT * FROM commissions WHERE id = $1 AND lead_id = $2', [req.params.id, req.params.leadId]);
    if (!existing) return res.status(404).json({ error: 'Commission not found' });
    if (!allowed[next].includes(existing.status)) {
      return res.status(409).json({ error: `This commission is already ${existing.status}` });
    }
    const commission = await one(
      `UPDATE commissions SET status = $2, paid_at = CASE WHEN $2 = 'paid' THEN now() ELSE paid_at END
        WHERE id = $1 RETURNING *`,
      [existing.id, next]
    );
    const amount = RUPEES.format(Number(commission.amount));
    await recordAudit(`Commission ${next}: ${amount}`, req.user.id, 'lead', req.params.leadId);
    await notify({ userId: commission.user_id, type: 'commission', title: `Commission ${next}: ${amount}`, body: commission.deal_ref });
    res.json({ commission });
  })
);

/* ---------- Referral, recorded by the team ---------- */

/* The client mentioned someone on a call rather than through their referral
   link. Same record either way: a new lead, credited to this client. */
router.post(
  '/:leadId/referrals',
  asyncHandler(async (req, res) => {
    const lead = await findLead(req, res);
    if (!lead) return;
    const out = await journey.submitReferral(lead.id, req.body, req.user.id);
    if (out.error) return res.status(400).json({ error: out.error });
    res.status(201).json({ lead: { id: out.lead.id, name: out.lead.name } });
  })
);

export default router;

