import { Router } from 'express';
import { many, one } from '../db.js';
import { asyncHandler, requireModule, requirePermission } from '../middleware.js';
import { newId, parseDate, recordAudit, safeUrl } from '../helpers.js';
import * as journey from '../clientJourney.js';

/* The client journey desk — outreach, appointments, shortlist, handover —
   for one client at a time. See src/clientJourney.js.

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
    const [appointments, shortlist, feedback, emails, referrals] = await Promise.all([
      many('SELECT * FROM appointments WHERE lead_id = $1 ORDER BY scheduled_at DESC', [lead.id]),
      many(
        `SELECT s.*, l.title, l.area, l.price, l.verified FROM lead_shortlist s
           JOIN listings l ON l.id = s.listing_id
          WHERE s.lead_id = $1 ORDER BY s.created_at`,
        [lead.id]
      ),
      one('SELECT * FROM client_feedback WHERE lead_id = $1', [lead.id]),
      many(
        `SELECT id, code, subject, status, error, created_at FROM email_log
          WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [lead.id]
      ),
      many('SELECT id, name, status, created_at FROM leads WHERE referred_by = $1 ORDER BY created_at DESC', [lead.id]),
    ]);
    res.json({
      lead,
      emailBlocker: journey.emailBlocker(lead),
      appointments,
      shortlist,
      feedback,
      emails,
      referrals,
    });
  })
);

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

    const appointment = await one(
      `INSERT INTO appointments (id, lead_id, scheduled_at, mode, location, meeting_link, purpose, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [newId('ap'), lead.id, scheduledAt, f.mode, f.location, f.meetingLink, f.purpose, req.user.id]
    );
    await recordAudit(`Appointment booked with ${lead.name}`, req.user.id, 'lead', lead.id);
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

    const appointment = await one(
      `UPDATE appointments SET scheduled_at = COALESCE($2, scheduled_at), status = COALESCE($3, status),
              mode = $4, location = $5, meeting_link = $6, purpose = $7
        WHERE id = $1 RETURNING *`,
      [existing.id, scheduledAt, body.status || null, f.mode, f.location, f.meetingLink, f.purpose]
    );
    const moved = scheduledAt && new Date(scheduledAt).getTime() !== new Date(existing.scheduled_at).getTime();
    if (moved && appointment.status === 'scheduled') {
      await journey.appointmentBooked(appointment.id, { rescheduled: true });
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
    res.status(201).json({ item });
  })
);

router.delete(
  '/:leadId/shortlist/:itemId',
  asyncHandler(async (req, res) => {
    const item = await one('DELETE FROM lead_shortlist WHERE id = $1 AND lead_id = $2 RETURNING id', [
      req.params.itemId,
      req.params.leadId,
    ]);
    if (!item) return res.status(404).json({ error: 'Not on this shortlist' });
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

export default router;
