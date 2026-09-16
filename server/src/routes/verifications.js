import { Router } from 'express';
import { many, one } from '../db.js';
import { asyncHandler, requireModule, requirePermission } from '../middleware.js';
import { newId, notify, recordAudit } from '../helpers.js';

const router = Router();

/* Live verifications are a Founder/Core desk. Partners never see the queue. */
router.use(requireModule('verifications'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const rows = await many(
      `SELECT v.*, l.title AS listing_title, p.name AS project_name,
              p.builder, p.rera, u.name AS assigned_to_name
         FROM verifications v
         LEFT JOIN listings l ON l.id = v.listing_id
         LEFT JOIN projects p ON p.id = v.project_id
         LEFT JOIN users u ON u.id = v.assigned_to
        WHERE ($1::text IS NULL OR $1 = 'all' OR v.status = $1)
        ORDER BY v.created_at DESC`,
      [status || null]
    );

    /* Turnaround, for the Core KPI strip. */
    const stats = await one(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'verified' AND finished_at > now() - interval '24 hours')::int AS verified_today,
         COUNT(*) FILTER (WHERE status IN ('pending','inprogress','escalated'))::int AS pending,
         COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (finished_at - started_at)) / 3600)
           FILTER (WHERE finished_at IS NOT NULL AND started_at IS NOT NULL)), 0)::int AS avg_hours
       FROM verifications`
    );
    res.json({ verifications: rows, stats });
  })
);

router.post(
  '/:id/start',
  requirePermission('verifications:write'),
  asyncHandler(async (req, res) => {
    const v = await one(
      `UPDATE verifications SET status='inprogress', assigned_to=$2,
              started_at = COALESCE(started_at, now())
        WHERE id=$1 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!v) return res.status(404).json({ error: 'Verification not found' });
    await recordAudit(`Verification ${v.id} started`, req.user.id, 'verification', v.id);
    res.json({ verification: v });
  })
);

router.post(
  '/:id/verify',
  requirePermission('verifications:write'),
  asyncHandler(async (req, res) => {
    const v = await one(
      `UPDATE verifications SET status='verified', finished_at=now(),
              started_at = COALESCE(started_at, now()), assigned_to=$2
        WHERE id=$1 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!v) return res.status(404).json({ error: 'Verification not found' });

    if (v.listing_id) {
      await one('UPDATE listings SET verified = TRUE WHERE id = $1 RETURNING id', [v.listing_id]);
    }
    await recordAudit(`Verification ${v.id} verified`, req.user.id, 'verification', v.id);
    res.json({ verification: v });
  })
);

router.post(
  '/:id/escalate',
  requirePermission('verifications:write'),
  asyncHandler(async (req, res) => {
    const v = await one(
      `UPDATE verifications SET status='escalated', escalated=TRUE, notes=COALESCE($2, notes)
        WHERE id=$1 RETURNING *`,
      [req.params.id, req.body?.notes ?? null]
    );
    if (!v) return res.status(404).json({ error: 'Verification not found' });

    /* Escalation opens a legal ticket so it lands in the Issues tracker too. */
    await one(
      `INSERT INTO tickets (id, title, description, category, priority, raised_by)
       VALUES ($1,$2,$3,'legal','high',$4) RETURNING id`,
      [newId('t'), `Escalation: verification ${v.id}`, v.notes || 'Escalated to legal', req.user.id]
    );
    await notify({ role: 'founder', type: 'approval', title: `Verification ${v.id} escalated to legal` });
    await recordAudit(`Verification ${v.id} escalated`, req.user.id, 'verification', v.id);
    res.json({ verification: v });
  })
);

/* CSV export, same columns the original dashboard produced. */
router.get(
  '/export.csv',
  asyncHandler(async (req, res) => {
    const rows = await many('SELECT * FROM verifications ORDER BY created_at DESC');
    const headers = [
      'id', 'type', 'status', 'listing_id', 'project_id', 'assigned_to',
      'created_at', 'started_at', 'finished_at', 'escalated', 'notes',
    ];
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
    ].join('\n');

    res.type('text/csv').attachment('verifications.csv').send(csv);
  })
);

export default router;
