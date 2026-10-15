import { Router } from 'express';
import { many, one } from '../db.js';
import { asyncHandler, requireModule, requirePermission } from '../middleware.js';
import { newId, notify, publishVerifiedListing, recordAudit, requestListingCorrections } from '../helpers.js';

const router = Router();

/* Live verifications are a Founder/Core desk. Partners never see the queue. */
router.use(requireModule('verifications'));

/* People read the notifications and audit lines these routes write, so they
   name the property rather than quoting the verification's internal id —
   "Verification vf_3a9c… escalated" meant nothing to anyone. */
async function subjectOf(v) {
  const row = await one(
    `SELECT COALESCE(l.title, p.name) AS name
       FROM verifications v
       LEFT JOIN listings l ON l.id = v.listing_id
       LEFT JOIN projects p ON p.id = v.project_id
      WHERE v.id = $1`,
    [v.id]
  );
  return row?.name ? `"${row.name}"` : `a ${String(v.type || 'listing').toLowerCase()}`;
}

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
    await recordAudit(`Verification of ${await subjectOf(v)} started`, req.user.id, 'verification', v.id);
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

    /* Same publish step as the listing sheet — into Projects, submitter told. */
    if (v.listing_id) await publishVerifiedListing(v.listing_id, req.user.id);
    await recordAudit(`Verification of ${await subjectOf(v)} verified`, req.user.id, 'verification', v.id);
    res.json({ verification: v });
  })
);

/* Back to the realtor with what to fix — same step as the listing sheet's. */
router.post(
  '/:id/corrections',
  requirePermission('verifications:write'),
  asyncHandler(async (req, res) => {
    const notes = String(req.body?.notes || '').trim();
    if (!notes) {
      return res.status(400).json({ error: 'Say what needs correcting — the realtor only sees this note' });
    }
    const v = await one('SELECT * FROM verifications WHERE id = $1', [req.params.id]);
    if (!v) return res.status(404).json({ error: 'Verification not found' });
    if (!v.listing_id) return res.status(409).json({ error: 'Only a listing can be sent back to a realtor' });

    const listing = await requestListingCorrections(v.listing_id, notes, req.user.id);
    if (!listing) return res.status(409).json({ error: 'That listing is already verified' });
    res.json({ verification: await one('SELECT * FROM verifications WHERE id = $1', [v.id]) });
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

    const what = await subjectOf(v);

    /* Escalation opens a legal ticket so it lands in the Issues tracker too. */
    await one(
      `INSERT INTO tickets (id, title, description, category, priority, raised_by)
       VALUES ($1,$2,$3,'legal','high',$4) RETURNING id`,
      [newId('t'), `Escalation: ${what}`, v.notes || 'Escalated to legal', req.user.id]
    );
    await notify({
      role: 'founder',
      type: 'approval',
      title: `Verification of ${what} escalated to legal`,
      body: v.notes || null,
    });
    await recordAudit(`Verification of ${what} escalated`, req.user.id, 'verification', v.id);
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
