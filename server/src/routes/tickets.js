import { Router } from 'express';
import { many, one } from '../db.js';
import { asyncHandler, requireModule, requirePermission } from '../middleware.js';
import { seesEverything } from '../rbac.js';
import { newId, notify, recordAudit } from '../helpers.js';

const router = Router();

/* "Issue or query raiser" for partners; "Issues Tracker and Dashboard" for
   Founder and Core. Same table, different scope. */
router.use(requireModule('issues'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const mineOnly = !seesEverything(req.user.role);
    const rows = await many(
      `SELECT t.*, r.name AS raised_by_name, r.role AS raised_by_role,
              a.name AS assigned_to_name
         FROM tickets t
         LEFT JOIN users r ON r.id = t.raised_by
         LEFT JOIN users a ON a.id = t.assigned_to
        WHERE ($2::boolean IS FALSE OR t.raised_by = $1)
        ORDER BY t.created_at DESC`,
      [req.user.id, mineOnly]
    );

    const stats = await one(
      `SELECT COUNT(*) FILTER (WHERE status = 'open')::int AS open,
              COUNT(*) FILTER (WHERE status = 'open' AND priority = 'high')::int AS high
         FROM tickets
        WHERE ($2::boolean IS FALSE OR raised_by = $1)`,
      [req.user.id, mineOnly]
    );
    res.json({ tickets: rows, stats, scope: req.scope });
  })
);

router.post(
  '/',
  requirePermission('tickets:create'),
  asyncHandler(async (req, res) => {
    const { title, description, category, priority } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });

    const id = newId('t');
    const ticket = await one(
      `INSERT INTO tickets (id, title, description, category, priority, raised_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, title, description || null, category || 'other', priority || 'medium', req.user.id]
    );
    await notify({
      role: 'core',
      type: 'ticket',
      title: `${req.user.name} raised: ${title}`,
      body: description,
    });
    await recordAudit(`Ticket "${title}" raised`, req.user.id, 'ticket', id);
    res.status(201).json({ ticket });
  })
);

router.patch(
  '/:id',
  requirePermission('tickets:resolve'),
  asyncHandler(async (req, res) => {
    const { status, priority, assignedTo } = req.body || {};
    const ticket = await one(
      `UPDATE tickets SET
         status = COALESCE($2, status),
         priority = COALESCE($3, priority),
         assigned_to = COALESCE($4, assigned_to),
         resolved_at = CASE WHEN $2 IN ('resolved','closed') THEN now() ELSE resolved_at END
       WHERE id = $1 RETURNING *`,
      [req.params.id, status ?? null, priority ?? null, assignedTo ?? null]
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    if (ticket.raised_by && status) {
      await notify({
        userId: ticket.raised_by,
        type: 'ticket',
        title: `Your issue "${ticket.title}" is now ${status}`,
      });
    }
    await recordAudit(`Ticket ${ticket.id} -> ${ticket.status}`, req.user.id, 'ticket', ticket.id);
    res.json({ ticket });
  })
);

export default router;
