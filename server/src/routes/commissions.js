import { Router } from 'express';
import { many, one } from '../db.js';
import { asyncHandler, requireModule, requirePermission } from '../middleware.js';
import { seesEverything } from '../rbac.js';
import { newId, notify, recordAudit } from '../helpers.js';

const router = Router();

router.use(requireModule('commissions'));

/* Partners see their own position and nothing else — this is the one place
   where a scoping mistake leaks other people's earnings, so the filter is in
   the WHERE clause, not applied to the result. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const mineOnly = !seesEverything(req.user.role);
    const rows = await many(
      `SELECT c.*, u.name AS user_name, u.role AS user_role
         FROM commissions c JOIN users u ON u.id = c.user_id
        WHERE ($2::boolean IS FALSE OR c.user_id = $1)
        ORDER BY c.created_at DESC`,
      [req.user.id, mineOnly]
    );

    const totals = await one(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS paid,
              COALESCE(SUM(amount) FILTER (WHERE status <> 'paid'), 0) AS pending
         FROM commissions
        WHERE ($2::boolean IS FALSE OR user_id = $1)`,
      [req.user.id, mineOnly]
    );
    res.json({ commissions: rows, totals, scope: req.scope });
  })
);

router.post(
  '/',
  requirePermission('commissions:write'),
  asyncHandler(async (req, res) => {
    const { userId, amount, dealRef, note } = req.body || {};
    if (!userId || amount == null) {
      return res.status(400).json({ error: 'userId and amount are required' });
    }

    const id = newId('cm');
    const commission = await one(
      `INSERT INTO commissions (id, user_id, deal_ref, amount, note)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [id, userId, dealRef || null, amount, note || null]
    );
    await notify({ userId, type: 'payment', title: `Commission recorded: ${amount}` });
    await recordAudit(`Commission ${amount} recorded for ${userId}`, req.user.id, 'commission', id);
    res.status(201).json({ commission });
  })
);

router.post(
  '/:id/pay',
  requirePermission('commissions:pay'),
  asyncHandler(async (req, res) => {
    const commission = await one(
      `UPDATE commissions SET status='paid', paid_at=now() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!commission) return res.status(404).json({ error: 'Commission not found' });

    await notify({
      userId: commission.user_id,
      type: 'payment',
      title: `Commission paid: ${commission.amount}`,
    });
    await recordAudit(`Commission ${commission.id} paid`, req.user.id, 'commission', commission.id);
    res.json({ commission });
  })
);

export default router;
