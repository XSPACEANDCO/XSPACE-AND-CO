import { Router } from 'express';
import { many, one, query } from '../db.js';
import { asyncHandler, requireModule, requirePermission } from '../middleware.js';
import { seesEverything } from '../rbac.js';
import { newId, notify, recordAudit } from '../helpers.js';
import { ALL_STATUSES, canAdvance, isValidPropertyType } from '../leadStatus.js';

const router = Router();

/* /clients backs one module for everybody. It used to back two — CRM for
   Founder/Core and Lead Tracker for partners — which put two sidebar entries
   on the same screen. Access is the same gate now; who sees which rows is
   scopeClause below. */
const leadModule = requireModule('crm');

/* Partners see leads they own OR sourced. Founder and Core see everything.
   Enforced in SQL so there is no path that returns rows and filters later. */
function scopeClause(user, startIndex = 1) {
  if (seesEverything(user.role)) return { where: '', params: [] };
  return {
    where: ` AND (l.assigned_to = $${startIndex} OR l.created_by = $${startIndex})`,
    params: [user.id],
  };
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* A lead may credit a piece of content as its source. A partner can only
   credit their own uploads — otherwise a creator could claim the leads from
   somebody else's reel. Returns an error message, or null when it is fine. */
/* Same rule for the listing a lead is pinned to: a partner may name a
   verified listing or one of their own, not another partner's inventory
   (the lead list would otherwise hand them its title). */
async function checkListing(user, listingId) {
  if (!listingId || seesEverything(user.role)) return null;
  const listing = await one(
    'SELECT id FROM listings WHERE id = $1 AND (verified OR assigned_to = $2 OR submitted_by = $2)',
    [listingId, user.id]
  );
  return listing ? null : 'Listing not found';
}

async function checkSourceMedia(user, mediaId) {
  if (!mediaId) return null;
  const media = await one('SELECT id, uploaded_by FROM media WHERE id = $1', [mediaId]);
  if (!media) return 'That content does not exist';
  if (!seesEverything(user.role) && media.uploaded_by !== user.id) {
    return 'You can only credit your own content as a lead source';
  }
  return null;
}

router.get(
  '/',
  leadModule,
  asyncHandler(async (req, res) => {
    const { where, params } = scopeClause(req.user);
    const rows = await many(
      `SELECT l.*, u.name AS assigned_to_name, li.title AS listing_title,
              sm.title AS source_media_title
         FROM leads l
         LEFT JOIN users u ON u.id = l.assigned_to
         LEFT JOIN listings li ON li.id = l.listing_id
         LEFT JOIN media sm ON sm.id = l.source_media_id
        WHERE 1=1 ${where}
        ORDER BY l.created_at DESC`,
      params
    );
    res.json({ leads: rows, scope: req.scope });
  })
);

router.get(
  '/:id',
  leadModule,
  asyncHandler(async (req, res) => {
    const { where, params } = scopeClause(req.user, 2);
    const lead = await one(
      `SELECT l.*, u.name AS assigned_to_name, sm.title AS source_media_title
         FROM leads l
         LEFT JOIN users u ON u.id = l.assigned_to
         LEFT JOIN media sm ON sm.id = l.source_media_id
        WHERE l.id = $1 ${where}`,
      [req.params.id, ...params]
    );
    /* 404 rather than 403 for a lead that exists but isn't theirs — no reason
       to confirm it exists. */
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const visits = await many(
      'SELECT * FROM visits WHERE lead_id = $1 ORDER BY scheduled_at DESC',
      [lead.id]
    );
    res.json({ lead, visits });
  })
);

router.post(
  '/',
  leadModule,
  requirePermission('leads:write'),
  asyncHandler(async (req, res) => {
    const {
      name, phone, source, budget, listingId, temperature, status,
      propertyType, configuration, preferredArea, timeline, sourceMediaId, followUpAt,
    } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!isValidPropertyType(propertyType)) {
      return res.status(400).json({ error: 'Unknown property type' });
    }
    if (status && !ALL_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Unknown status' });
    }
    const sourceErr = (await checkSourceMedia(req.user, sourceMediaId)) || (await checkListing(req.user, listingId));
    if (sourceErr) return res.status(400).json({ error: sourceErr });

    /* A partner can only create leads against themselves; assigning to someone
       else is a Founder/Core action. */
    let assignedTo = req.user.id;
    if (req.body.assignedTo && seesEverything(req.user.role)) assignedTo = req.body.assignedTo;

    const id = newId('c');
    const lead = await one(
      `INSERT INTO leads (id, name, phone, source, budget, status, temperature, assigned_to,
                          created_by, listing_id, property_type, configuration, preferred_area, timeline,
                          source_media_id, follow_up_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        id, name, phone || null, source || null, budget || null,
        status || 'New', temperature || 'warm', assignedTo, req.user.id, listingId || null,
        propertyType || null, configuration || null, preferredArea || null, timeline || null,
        sourceMediaId || null, parseDate(followUpAt),
      ]
    );
    if (assignedTo !== req.user.id) {
      await notify({ userId: assignedTo, type: 'lead', title: `Lead assigned to you: ${name}` });
    }
    await recordAudit(`Lead ${name} created`, req.user.id, 'lead', id);
    res.status(201).json({ lead });
  })
);

router.patch(
  '/:id',
  leadModule,
  requirePermission('leads:write'),
  asyncHandler(async (req, res) => {
    const { where, params } = scopeClause(req.user, 2);
    const existing = await one(
      `SELECT l.* FROM leads l WHERE l.id = $1 ${where}`,
      [req.params.id, ...params]
    );
    if (!existing) return res.status(404).json({ error: 'Lead not found' });

    /* A lead moves forward or it drops out. Rejecting a backwards move here
       rather than only hiding the button means it holds for any caller. */
    const nextStatus = req.body.status;
    if (nextStatus && nextStatus !== existing.status) {
      if (!ALL_STATUSES.includes(nextStatus)) {
        return res.status(400).json({ error: 'Unknown status' });
      }
      if (!canAdvance(existing.status, nextStatus)) {
        return res.status(409).json({
          error: `A lead cannot go back to "${nextStatus}" once it is "${existing.status}"`,
          code: 'status_regression',
        });
      }
    }

    if (!isValidPropertyType(req.body.propertyType)) {
      return res.status(400).json({ error: 'Unknown property type' });
    }

    /* Reassignment is a Founder/Core-only field. */
    const wantsReassign = req.body.assignedTo && req.body.assignedTo !== existing.assigned_to;
    if (wantsReassign && !seesEverything(req.user.role)) {
      return res.status(403).json({ error: 'Your role cannot reassign leads' });
    }

    const sourceErr =
      (await checkSourceMedia(req.user, req.body.sourceMediaId)) ||
      (await checkListing(req.user, req.body.listingId));
    if (sourceErr) return res.status(400).json({ error: sourceErr });

    /* The follow-up date has to be clearable — a call made is a call no
       longer owed — so it is written whenever the key is present, null
       included, rather than through COALESCE like the rest. */
    const setsFollowUp = 'followUpAt' in (req.body || {});

    const lead = await one(
      `UPDATE leads SET
         name = COALESCE($2, name),
         phone = COALESCE($3, phone),
         source = COALESCE($4, source),
         budget = COALESCE($5, budget),
         status = COALESCE($6, status),
         temperature = COALESCE($7, temperature),
         assigned_to = COALESCE($8, assigned_to),
         listing_id = COALESCE($9, listing_id),
         property_type = COALESCE($10, property_type),
         configuration = COALESCE($11, configuration),
         preferred_area = COALESCE($12, preferred_area),
         timeline = COALESCE($13, timeline),
         notes = COALESCE($14, notes),
         source_media_id = COALESCE($15, source_media_id),
         follow_up_at = CASE WHEN $16::boolean THEN $17::timestamptz ELSE follow_up_at END,
         last_interaction_at = now()
       WHERE id = $1 RETURNING *`,
      [
        req.params.id, req.body.name ?? null, req.body.phone ?? null, req.body.source ?? null,
        req.body.budget ?? null, req.body.status ?? null, req.body.temperature ?? null,
        wantsReassign ? req.body.assignedTo : null, req.body.listingId ?? null,
        req.body.propertyType ?? null, req.body.configuration ?? null,
        req.body.preferredArea ?? null, req.body.timeline ?? null, req.body.notes ?? null,
        req.body.sourceMediaId || null, setsFollowUp, parseDate(req.body.followUpAt),
      ]
    );

    /* Tell the people a change happens *to*: the new owner of a reassigned
       lead, and the owner and sourcing partner when somebody else moves it
       along the pipeline. Nobody is told about their own edits. */
    if (wantsReassign) {
      await notify({ userId: lead.assigned_to, type: 'lead', title: `Lead assigned to you: ${lead.name}` });
    }
    if (nextStatus && nextStatus !== existing.status) {
      for (const userId of new Set([lead.assigned_to, lead.created_by])) {
        if (userId && userId !== req.user.id) {
          await notify({ userId, type: 'lead', title: `${lead.name} moved to ${nextStatus}` });
        }
      }
    }
    await recordAudit(`Lead ${lead.name} updated`, req.user.id, 'lead', lead.id);
    res.json({ lead });
  })
);

router.delete(
  '/:id',
  leadModule,
  requirePermission('leads:assign'),
  asyncHandler(async (req, res) => {
    await query('DELETE FROM leads WHERE id = $1', [req.params.id]);
    await recordAudit(`Lead ${req.params.id} deleted`, req.user.id, 'lead', req.params.id);
    res.json({ ok: true });
  })
);

export default router;
