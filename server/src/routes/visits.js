import { Router } from 'express';
import { many, one } from '../db.js';
import { asyncHandler, requireModule, requirePermission } from '../middleware.js';
import { seesEverything } from '../rbac.js';
import { newId, notify, parseDate, recordActivity, recordAudit, safeUrl } from '../helpers.js';
import * as automations from '../automations.js';

const router = Router();

router.use(requireModule('visits'));

function scopeClause(user, startIndex = 1) {
  if (seesEverything(user.role)) return { where: '', params: [] };
  return { where: ` AND v.assigned_to = $${startIndex}`, params: [user.id] };
}

/* Reason -> the follow-up the portal queues automatically. Mirrors the rule
   the original sitevisits.html encoded in autoFollowUp(). */
const FOLLOW_UP = {
  'No Response': 'Auto follow-up call in 24 hrs',
  'Client Unavailable': 'Auto follow-up call in 24 hrs',
  'Budget Issue': 'Suggest lower budget listings in 48 hrs',
  'Location Not Liked': 'Suggest alternate areas in 48 hrs',
  'Project Not Liked': 'Suggest similar projects in 48 hrs',
  'Reschedule Requested': 'Reschedule visit with new date & time',
};
const DEFAULT_FOLLOW_UP = 'Manual follow-up in 24–48 hrs';

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { where, params } = scopeClause(req.user);
    const rows = await many(
      `SELECT v.*, l.name AS client_name, l.temperature,
              li.title AS listing_title, u.name AS agent_name
         FROM visits v
         LEFT JOIN leads l ON l.id = v.lead_id
         LEFT JOIN listings li ON li.id = v.listing_id
         LEFT JOIN users u ON u.id = v.assigned_to
        WHERE 1=1 ${where}
        ORDER BY v.scheduled_at DESC NULLS LAST`,
      params
    );
    res.json({ visits: rows });
  })
);

router.post(
  '/',
  requirePermission('visits:write'),
  asyncHandler(async (req, res) => {
    const { leadId, listingId, mode } = req.body || {};
    const scheduledAt = parseDate(req.body?.scheduledAt);
    if (!scheduledAt) return res.status(400).json({ error: 'A valid date and time is required' });

    /* A partner can only book a visit for their own client, at a listing
       they can see. Otherwise naming somebody else's lead id here would
       attach that client to this partner's visit — and the visit list would
       then show them the client's name. */
    if (!seesEverything(req.user.role)) {
      if (leadId) {
        const lead = await one(
          'SELECT id FROM leads WHERE id = $1 AND (assigned_to = $2 OR created_by = $2)',
          [leadId, req.user.id]
        );
        if (!lead) return res.status(404).json({ error: 'Client not found' });
      }
      if (listingId) {
        const listing = await one(
          'SELECT id FROM listings WHERE id = $1 AND (verified OR assigned_to = $2 OR submitted_by = $2)',
          [listingId, req.user.id]
        );
        if (!listing) return res.status(404).json({ error: 'Listing not found' });
      }
    }

    let assignedTo = req.user.id;
    if (req.body.assignedTo && seesEverything(req.user.role)) assignedTo = req.body.assignedTo;

    /* What the client's confirmation email tells them: where to meet, a map
       link, and which Xspace team member is their contact (Founder/Core only
       pick that; otherwise it falls back to the lead's Xspace owner). */
    const mapLink = safeUrl(req.body.mapLink);
    if (mapLink === undefined) return res.status(400).json({ error: 'The map link must start with http:// or https://' });
    const meetingPoint = String(req.body.meetingPoint || '').trim() || null;
    const repId = seesEverything(req.user.role) ? req.body.repId || req.user.id : null;
    if (req.body.repId && repId === req.body.repId) {
      const rep = await one("SELECT id FROM users WHERE id = $1 AND role IN ('founder','core') AND active", [repId]);
      if (!rep) return res.status(400).json({ error: 'The Xspace representative must be a Founder or Core member' });
    }

    const id = newId('v');
    const visit = await one(
      `INSERT INTO visits (id, lead_id, listing_id, assigned_to, scheduled_at, mode, meeting_point, map_link, rep_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [id, leadId || null, listingId || null, assignedTo, scheduledAt, mode || 'On-site', meetingPoint, mapLink, repId]
    );
    await recordActivity(`${req.user.name} scheduled a site visit`, req.user.id);
    await recordAudit(`Visit ${id} scheduled`, req.user.id, 'visit', id);
    automations.visitScheduled(id, req.user.id);
    res.status(201).json({ visit });
  })
);

/* Completing your own visit is fine; marking one unsuccessful or rescheduling
   it is a Core/Founder call, because it drives the follow-up pipeline. */
router.post(
  '/:id/complete',
  requirePermission('visits:write'),
  asyncHandler(async (req, res) => {
    const { where, params } = scopeClause(req.user, 2);
    const existing = await one(`SELECT v.* FROM visits v WHERE v.id = $1 ${where}`, [
      req.params.id,
      ...params,
    ]);
    if (!existing) return res.status(404).json({ error: 'Visit not found' });

    const visit = await one(
      `UPDATE visits SET status='Completed', ended_at=now(),
              feedback = COALESCE($2, feedback),
              feedback_submitted_at = CASE WHEN $2 IS NULL THEN feedback_submitted_at ELSE now() END
        WHERE id=$1 RETURNING *`,
      [req.params.id, req.body?.feedback ?? null]
    );
    await recordAudit(`Visit ${visit.id} completed`, req.user.id, 'visit', visit.id);
    automations.visitCompleted(visit.id);
    res.json({ visit });
  })
);

router.post(
  '/:id/unsuccessful',
  requirePermission('visits:resolve'),
  asyncHandler(async (req, res) => {
    const { reason } = req.body || {};
    if (!reason) return res.status(400).json({ error: 'reason is required' });

    const visit = await one(
      `UPDATE visits SET status='Unsuccessful', reason=$2, ended_at=now()
        WHERE id=$1 RETURNING *`,
      [req.params.id, reason]
    );
    if (!visit) return res.status(404).json({ error: 'Visit not found' });

    const followUp = FOLLOW_UP[reason] || DEFAULT_FOLLOW_UP;
    if (visit.assigned_to) {
      await notify({
        userId: visit.assigned_to,
        type: 'task',
        title: 'Follow-up created',
        body: followUp,
      });
    }
    await recordAudit(`Visit ${visit.id} marked unsuccessful: ${reason}`, req.user.id, 'visit', visit.id);
    res.json({ visit, followUp });
  })
);

router.post(
  '/:id/reschedule',
  requirePermission('visits:resolve'),
  asyncHandler(async (req, res) => {
    const scheduledAt = parseDate(req.body?.scheduledAt);
    if (!scheduledAt) return res.status(400).json({ error: 'A valid date and time is required' });

    const visit = await one(
      `UPDATE visits SET status='Rescheduled', scheduled_at=$2 WHERE id=$1 RETURNING *`,
      [req.params.id, scheduledAt]
    );
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    await recordAudit(`Visit ${visit.id} rescheduled`, req.user.id, 'visit', visit.id);
    automations.visitRescheduled(visit.id, req.user.id);
    res.json({ visit });
  })
);

export default router;
