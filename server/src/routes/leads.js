import { Router } from 'express';
import { many, one } from '../db.js';
import { asyncHandler, requireModule, requirePermission } from '../middleware.js';
import { seesEverything } from '../rbac.js';
import { newId, notify, recordAudit } from '../helpers.js';
import {
  ALL_STATUSES, FOLLOW_UP_TYPES, canAdvance, isValidPropertyType, isValidSubtype,
} from '../leadStatus.js';
import * as automations from '../automations.js';
import * as journey from '../clientJourney.js';

const router = Router();

const TEMPERATURES = ['hot', 'warm', 'cold'];

/* The account a lead is handed to must exist and be switched on — otherwise
   the insert fails on the foreign key and the caller gets a 500. Returns an
   error message or null. */
async function checkAssignee(userId) {
  const user = await one('SELECT id FROM users WHERE id = $1 AND active', [userId]);
  return user ? null : 'That person does not exist or is deactivated';
}

/* A client email is optional; it is what their site-visit emails go to.
   Returns the cleaned address, null for none, or undefined when it does not
   look like one. */
function cleanEmail(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return null;
  return automations.EMAIL_RE.test(v) ? v : undefined;
}

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

/* What a creator partner sees of a lead they generated: who it is, where it
   came from, what they asked for and how far it has got. Not the client's
   contact details, the internal notes, the follow-ups or the deal — Xspace
   owns the relationship from here. Chosen in SQL, so the rest never leaves
   the server. */
const PARTNER_LEAD_FIELDS = `
  l.id, l.name, l.status, l.source, l.source_media_id, l.listing_id,
  l.budget, l.preferred_area, l.property_type, l.property_subtype, l.configuration,
  l.created_at, l.closed_at, sm.title AS source_media_title, li.title AS listing_title`;

/* Everything the CRM list shows Founder and Core: the lead, its owner, and
   when anything last happened to it. */
const INTERNAL_LEAD_FIELDS = `
  l.*, u.name AS assigned_to_name, li.title AS listing_title, sm.title AS source_media_title,
  fo.name AS follow_up_owner_name,
  GREATEST(l.created_at, l.last_interaction_at,
           (SELECT max(a.created_at) FROM audit_log a WHERE a.entity = 'lead' AND a.entity_id = l.id)
  ) AS last_activity_at`;

const LEAD_JOINS = `
  FROM leads l
  LEFT JOIN users u ON u.id = l.assigned_to
  LEFT JOIN users fo ON fo.id = l.follow_up_owner
  LEFT JOIN listings li ON li.id = l.listing_id
  LEFT JOIN media sm ON sm.id = l.source_media_id`;

const fieldsFor = (user) => (seesEverything(user.role) ? INTERNAL_LEAD_FIELDS : PARTNER_LEAD_FIELDS);

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
      `SELECT ${fieldsFor(req.user)} ${LEAD_JOINS}
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
      `SELECT ${fieldsFor(req.user)} ${LEAD_JOINS}
        WHERE l.id = $1 ${where}`,
      [req.params.id, ...params]
    );
    /* 404 rather than 403 for a lead that exists but isn't theirs — no reason
       to confirm it exists. */
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json({ lead });
  })
);

router.post(
  '/',
  leadModule,
  requirePermission('leads:submit'),
  asyncHandler(async (req, res) => {
    req.body = req.body || {};
    const internal = seesEverything(req.user.role);
    /* A creator hands over who the lead is and what they asked for. How hot
       it is, where it stands and who follows it up are Xspace's to decide. */
    const body = internal
      ? req.body
      : { ...req.body, status: undefined, temperature: undefined, followUpAt: undefined, notes: undefined, assignedTo: undefined };
    const {
      name, phone, source, budget, listingId, temperature, status,
      propertyType, propertySubtype, configuration, preferredArea, timeline, sourceMediaId, followUpAt,
    } = body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (temperature && !TEMPERATURES.includes(temperature)) {
      return res.status(400).json({ error: 'temperature must be hot, warm or cold' });
    }
    if (!isValidPropertyType(propertyType)) {
      return res.status(400).json({ error: 'Unknown property type' });
    }
    if (!isValidSubtype(propertyType, propertySubtype)) {
      return res.status(400).json({ error: 'That sub-type does not belong to this property type' });
    }
    if (status && !ALL_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Unknown status' });
    }
    const email = cleanEmail(body.email);
    if (email === undefined) return res.status(400).json({ error: 'That email address does not look valid' });
    const sourceErr = (await checkSourceMedia(req.user, sourceMediaId)) || (await checkListing(req.user, listingId));
    if (sourceErr) return res.status(400).json({ error: sourceErr });

    /* Founder/Core own what they create unless they hand it to a colleague.
       A creator's lead belongs to Xspace, not to them: it arrives unowned,
       and the team picks it up. created_by keeps it on the creator's list. */
    let assignedTo = internal ? req.user.id : null;
    if (internal && body.assignedTo) {
      const assigneeErr = await checkAssignee(body.assignedTo);
      if (assigneeErr) return res.status(400).json({ error: assigneeErr });
      assignedTo = body.assignedTo;
    }

    const id = newId('c');
    const lead = await one(
      `INSERT INTO leads (id, name, phone, source, budget, status, temperature, assigned_to,
                          created_by, listing_id, property_type, configuration, preferred_area, timeline,
                          source_media_id, follow_up_at, property_subtype, email, purpose,
                          other_preferences, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
      [
        id, name, phone || null, source || null, budget || null,
        status || 'New', temperature || 'warm', assignedTo, req.user.id, listingId || null,
        propertyType || null, configuration || null, preferredArea || null, timeline || null,
        sourceMediaId || null, parseDate(followUpAt), propertySubtype || null, email,
        String(body.purpose || '').trim() || null,
        String(body.otherPreferences || '').trim() || null,
        String(body.notes || '').trim() || null,
      ]
    );
    if (assignedTo && assignedTo !== req.user.id) {
      await notify({ userId: assignedTo, type: 'lead', title: `Lead assigned to you: ${name}` });
    }
    if (!internal) {
      for (const role of ['founder', 'core']) {
        await notify({ role, type: 'lead', title: `New lead from ${req.user.name}: ${name}`, body: 'Unassigned — pick it up in the CRM.' });
      }
    }
    await recordAudit(`Client created${internal ? '' : ` — submitted by ${req.user.name}`}`, req.user.id, 'lead', id);
    automations.leadFromContent(lead);
    res.status(201).json({ lead: internal ? lead : { id: lead.id, name: lead.name, status: lead.status } });
  })
);

const REQUIREMENT_KEYS = [
  'budget', 'preferredArea', 'propertyType', 'propertySubtype', 'configuration',
  'timeline', 'purpose', 'otherPreferences',
];
const STAMP = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
});

/* What an edit did, in words, for the client's activity history. One line
   per kind of change rather than a bare "updated". */
function changeLog(before, after, body) {
  const out = [];
  if (after.status !== before.status) out.push(`Status moved to ${after.status}`);
  if (REQUIREMENT_KEYS.some((k) => k in body)) out.push('Requirement updated');
  if (after.temperature !== before.temperature) out.push(`Temperature set to ${after.temperature}`);
  if (after.assigned_to !== before.assigned_to) out.push('Lead owner changed');
  if ('followUpAt' in body) {
    out.push(after.follow_up_at
      ? `Follow-up scheduled for ${STAMP.format(new Date(after.follow_up_at))}${after.follow_up_type ? ` (${after.follow_up_type})` : ''}`
      : 'Follow-up marked done');
  }
  if ('notes' in body && (after.notes || '') !== (before.notes || '')) out.push('Internal notes updated');
  if ((after.email || '') !== (before.email || '')) out.push('Email address changed');
  if (['name', 'phone', 'source'].some((k) => k in body && body[k] !== before[k])) out.push('Contact details updated');
  return out.length ? out : ['Client details updated'];
}

router.patch(
  '/:id',
  leadModule,
  requirePermission('leads:write'),
  asyncHandler(async (req, res) => {
    req.body = req.body || {};
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
    /* Checked against the type the lead will have after this edit. An empty
       string clears the sub-type (it is written, unlike null). */
    const nextType = req.body.propertyType ?? existing.property_type;
    const nextSub = req.body.propertySubtype ?? existing.property_subtype;
    if (!isValidSubtype(nextType, nextSub)) {
      return res.status(400).json({ error: 'That sub-type does not belong to this property type' });
    }

    /* Reassignment is a Founder/Core-only field. */
    const wantsReassign = req.body.assignedTo && req.body.assignedTo !== existing.assigned_to;
    if (wantsReassign && !seesEverything(req.user.role)) {
      return res.status(403).json({ error: 'Your role cannot reassign leads' });
    }
    if (wantsReassign) {
      const assigneeErr = await checkAssignee(req.body.assignedTo);
      if (assigneeErr) return res.status(400).json({ error: assigneeErr });
    }
    if (req.body.temperature && !TEMPERATURES.includes(req.body.temperature)) {
      return res.status(400).json({ error: 'temperature must be hot, warm or cold' });
    }

    /* Sent as '' to clear it; left out to keep it. */
    const setsEmail = 'email' in (req.body || {});
    const email = setsEmail ? cleanEmail(req.body.email) : null;
    if (email === undefined) return res.status(400).json({ error: 'That email address does not look valid' });

    const sourceErr =
      (await checkSourceMedia(req.user, req.body.sourceMediaId)) ||
      (await checkListing(req.user, req.body.listingId));
    if (sourceErr) return res.status(400).json({ error: sourceErr });

    /* The follow-up date has to be clearable — a call made is a call no
       longer owed — so it is written whenever the key is present, null
       included, rather than through COALESCE like the rest. */
    const setsFollowUp = 'followUpAt' in (req.body || {});
    if (req.body.followUpType && !FOLLOW_UP_TYPES.includes(req.body.followUpType)) {
      return res.status(400).json({ error: 'Unknown follow-up type' });
    }
    const setsFollowUpOwner = 'followUpOwner' in (req.body || {});
    if (req.body.followUpOwner) {
      const owner = await one(
        "SELECT id FROM users WHERE id = $1 AND active AND role IN ('founder','core')",
        [req.body.followUpOwner]
      );
      if (!owner) return res.status(400).json({ error: 'Follow-ups are made by a Founder or Core member' });
    }

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
         property_subtype = NULLIF(COALESCE($18, property_subtype), ''),
         email = CASE WHEN $19::boolean THEN $20 ELSE email END,
         purpose = COALESCE($21, purpose),
         other_preferences = COALESCE($22, other_preferences),
         follow_up_type = CASE WHEN $16::boolean THEN $23 ELSE follow_up_type END,
         follow_up_note = CASE WHEN $16::boolean THEN $24 ELSE follow_up_note END,
         follow_up_owner = CASE WHEN $25::boolean THEN $26 ELSE follow_up_owner END,
         last_interaction_at = now()
       WHERE id = $1 RETURNING *`,
      [
        req.params.id, req.body.name ?? null, req.body.phone ?? null, req.body.source ?? null,
        req.body.budget ?? null, req.body.status ?? null, req.body.temperature ?? null,
        wantsReassign ? req.body.assignedTo : null, req.body.listingId ?? null,
        req.body.propertyType ?? null, req.body.configuration ?? null,
        req.body.preferredArea ?? null, req.body.timeline ?? null, req.body.notes ?? null,
        req.body.sourceMediaId || null, setsFollowUp, parseDate(req.body.followUpAt),
        req.body.propertySubtype ?? null, setsEmail, email, req.body.purpose ?? null,
        req.body.otherPreferences ?? null,
        String(req.body.followUpType || '').trim() || null,
        String(req.body.followUpNote || '').trim() || null,
        setsFollowUpOwner, req.body.followUpOwner || null,
      ]
    );

    /* The deal is done: congratulate the client (CL-10). Handover is its
       own, later event — see routes/journey.js. */
    if (nextStatus === 'Closed' && existing.status !== 'Closed') {
      journey.dealClosed(lead.id, req.user.id);
    }

    /* Newly credited to a piece of content: tell its creator. */
    if (lead.source_media_id && lead.source_media_id !== existing.source_media_id) {
      automations.leadFromContent(lead);
    }

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
    for (const text of changeLog(existing, lead, req.body)) {
      await recordAudit(text, req.user.id, 'lead', lead.id);
    }
    res.json({ lead });
  })
);

router.delete(
  '/:id',
  leadModule,
  requirePermission('leads:assign'),
  asyncHandler(async (req, res) => {
    /* Deleting a client takes their history with it (site visits cascade),
       so it is the Founder's decision alone — Core can reassign or drop a
       lead, not erase it. */
    if (req.user.role !== 'founder') {
      return res.status(403).json({ error: 'Only a Founder can delete a client' });
    }
    const lead = await one('DELETE FROM leads WHERE id = $1 RETURNING id, name', [req.params.id]);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    await recordAudit(`Lead ${lead.name} deleted`, req.user.id, 'lead', lead.id);
    res.json({ ok: true });
  })
);

export default router;
