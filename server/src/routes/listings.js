import { Router } from 'express';
import { many, one } from '../db.js';
import { asyncHandler, requireModule, requirePermission } from '../middleware.js';
import { seesEverything } from '../rbac.js';
import { newId, notify, recordActivity, recordAudit } from '../helpers.js';

const router = Router();

router.use(requireModule('listings'));

/* Realtor partners see only inventory they submitted or are assigned. */
function scopeClause(user, startIndex = 1) {
  if (seesEverything(user.role)) return { where: '', params: [] };
  return {
    where: ` AND (l.assigned_to = $${startIndex} OR l.submitted_by = $${startIndex})`,
    params: [user.id],
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { where, params } = scopeClause(req.user);
    const rows = await many(
      `SELECT l.*, p.name AS project_name, p.builder,
              su.name AS submitted_by_name, au.name AS assigned_to_name
         FROM listings l
         LEFT JOIN projects p ON p.id = l.project_id
         LEFT JOIN users su ON su.id = l.submitted_by
         LEFT JOIN users au ON au.id = l.assigned_to
        WHERE 1=1 ${where}
        ORDER BY l.created_at DESC`,
      params
    );
    res.json({ listings: rows, canVerify: seesEverything(req.user.role) });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { where, params } = scopeClause(req.user, 2);
    const listing = await one(
      `SELECT l.*, p.name AS project_name, p.builder, p.rera, p.possession
         FROM listings l
         LEFT JOIN projects p ON p.id = l.project_id
        WHERE l.id = $1 ${where}`,
      [req.params.id, ...params]
    );
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    const media = await many('SELECT * FROM media WHERE project_id = $1 ORDER BY created_at DESC', [
      listing.project_id,
    ]);
    res.json({ listing, media });
  })
);

router.post(
  '/',
  requirePermission('listings:write'),
  asyncHandler(async (req, res) => {
    const { title, projectId, area, price, unitType } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });

    const id = newId('l');
    const listing = await one(
      `INSERT INTO listings (id, title, project_id, area, price, unit_type, submitted_by, assigned_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
      [id, title, projectId || null, area || null, price || null, unitType || null, req.user.id]
    );

    /* A new listing needs verifying before it can be shown to a client. */
    await one(
      `INSERT INTO verifications (id, listing_id, project_id, type, notes)
       VALUES ($1,$2,$3,'Listing',$4) RETURNING id`,
      [newId('vf'), id, projectId || null, 'Awaiting first pass']
    );
    await recordActivity(`${req.user.name} added listing ${title}`, req.user.id);
    await recordAudit(`Listing ${title} created`, req.user.id, 'listing', id);
    await notify({ role: 'core', type: 'verification', title: `New listing to verify: ${title}` });

    res.status(201).json({ listing });
  })
);

router.patch(
  '/:id',
  requirePermission('listings:write'),
  asyncHandler(async (req, res) => {
    const { where, params } = scopeClause(req.user, 2);
    const existing = await one(`SELECT l.* FROM listings l WHERE l.id = $1 ${where}`, [
      req.params.id,
      ...params,
    ]);
    if (!existing) return res.status(404).json({ error: 'Listing not found' });

    /* `verified` is never settable here — that goes through :id/verify, which
       requires the listings:verify permission. */
    const listing = await one(
      `UPDATE listings SET
         title = COALESCE($2, title),
         area = COALESCE($3, area),
         price = COALESCE($4, price),
         unit_type = COALESCE($5, unit_type),
         status = COALESCE($6, status),
         project_id = COALESCE($7, project_id)
       WHERE id = $1 RETURNING *`,
      [
        req.params.id, req.body.title ?? null, req.body.area ?? null, req.body.price ?? null,
        req.body.unitType ?? null, req.body.status ?? null, req.body.projectId ?? null,
      ]
    );
    await recordAudit(`Listing ${listing.title} updated`, req.user.id, 'listing', listing.id);
    res.json({ listing });
  })
);

router.post(
  '/:id/verify',
  requirePermission('listings:verify'),
  asyncHandler(async (req, res) => {
    const listing = await one(
      'UPDATE listings SET verified = TRUE WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    await one(
      `UPDATE verifications SET status='verified', finished_at=now(),
              started_at = COALESCE(started_at, now()), assigned_to=$2
        WHERE listing_id=$1 AND status <> 'verified' RETURNING id`,
      [req.params.id, req.user.id]
    );
    await recordAudit(`Listing ${listing.title} verified`, req.user.id, 'listing', listing.id);
    if (listing.submitted_by) {
      await notify({
        userId: listing.submitted_by,
        type: 'verification',
        title: `Your listing "${listing.title}" was verified`,
      });
    }
    res.json({ listing });
  })
);

export default router;
