import { Router } from 'express';
import { many, one, query } from '../db.js';
import { asyncHandler, requireModule, requirePermission } from '../middleware.js';
import { seesEverything } from '../rbac.js';
import { newId, recordAudit } from '../helpers.js';

const router = Router();

/* /clients backs two modules: CRM for Founder/Core, Lead Tracker for partners.
   Let either through, then scope the rows. */
function leadModule(req, res, next) {
  const key = seesEverything(req.user.role) ? 'crm' : 'leadTracker';
  return requireModule(key)(req, res, next);
}

/* Partners see leads they own OR sourced. Founder and Core see everything.
   Enforced in SQL so there is no path that returns rows and filters later. */
function scopeClause(user, startIndex = 1) {
  if (seesEverything(user.role)) return { where: '', params: [] };
  return {
    where: ` AND (l.assigned_to = $${startIndex} OR l.created_by = $${startIndex})`,
    params: [user.id],
  };
}

router.get(
  '/',
  leadModule,
  asyncHandler(async (req, res) => {
    const { where, params } = scopeClause(req.user);
    const rows = await many(
      `SELECT l.*, u.name AS assigned_to_name, li.title AS listing_title
         FROM leads l
         LEFT JOIN users u ON u.id = l.assigned_to
         LEFT JOIN listings li ON li.id = l.listing_id
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
      `SELECT l.*, u.name AS assigned_to_name
         FROM leads l
         LEFT JOIN users u ON u.id = l.assigned_to
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
    const { name, phone, source, budget, listingId, temperature, status } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });

    /* A partner can only create leads against themselves; assigning to someone
       else is a Founder/Core action. */
    let assignedTo = req.user.id;
    if (req.body.assignedTo && seesEverything(req.user.role)) assignedTo = req.body.assignedTo;

    const id = newId('c');
    const lead = await one(
      `INSERT INTO leads (id, name, phone, source, budget, status, temperature, assigned_to, created_by, listing_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        id, name, phone || null, source || null, budget || null,
        status || 'Discovery', temperature || 'warm', assignedTo, req.user.id, listingId || null,
      ]
    );
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

    /* Reassignment is a Founder/Core-only field. */
    const wantsReassign = req.body.assignedTo && req.body.assignedTo !== existing.assigned_to;
    if (wantsReassign && !seesEverything(req.user.role)) {
      return res.status(403).json({ error: 'Your role cannot reassign leads' });
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
         last_interaction_at = now()
       WHERE id = $1 RETURNING *`,
      [
        req.params.id, req.body.name ?? null, req.body.phone ?? null, req.body.source ?? null,
        req.body.budget ?? null, req.body.status ?? null, req.body.temperature ?? null,
        wantsReassign ? req.body.assignedTo : null, req.body.listingId ?? null,
      ]
    );
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
