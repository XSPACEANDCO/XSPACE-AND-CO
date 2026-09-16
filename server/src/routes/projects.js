import { Router } from 'express';
import { many, one } from '../db.js';
import { asyncHandler, requireModule, requirePermission } from '../middleware.js';
import { newId, recordAudit } from '../helpers.js';

const router = Router();

router.use(requireModule('projects'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    /* Creators get new and upcoming projects only — they pitch inventory, they
       don't need the full internal book. */
    const upcomingOnly = req.scope === 'upcoming';
    /* Projects are the verified book, so each one is summarised by the
       verified inventory under it, not by every listing ever filed against
       it. The headline figures come from the first verified listing, which
       for a project created by verifying a listing is that listing. */
    const rows = await many(
      `SELECT p.*,
              COUNT(l.id) FILTER (WHERE l.verified)::int AS listing_count,
              MIN(l.area)          FILTER (WHERE l.verified) AS area,
              MIN(l.price)         FILTER (WHERE l.verified) AS price,
              MIN(l.property_type) FILTER (WHERE l.verified) AS property_type,
              MIN(l.configuration) FILTER (WHERE l.verified) AS configuration,
              MIN(l.rera_number)   FILTER (WHERE l.verified) AS listing_rera,
              MAX(l.verified_at)   FILTER (WHERE l.verified) AS verified_at
         FROM projects p
         LEFT JOIN listings l ON l.project_id = p.id
        ${upcomingOnly ? "WHERE p.status IN ('Upcoming','Under Construction','New Launch')" : ''}
        GROUP BY p.id
        ORDER BY p.created_at DESC`
    );
    res.json({ projects: rows, scope: req.scope });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const project = await one('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const listings = await many('SELECT * FROM listings WHERE project_id = $1', [project.id]);
    const media = await many(
      "SELECT * FROM media WHERE project_id = $1 AND status = 'delivered'",
      [project.id]
    );
    res.json({ project, listings, media });
  })
);

router.post(
  '/',
  requirePermission('projects:write'),
  asyncHandler(async (req, res) => {
    const { name, builder, rera, status, units, possession } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });

    const id = newId('p');
    const project = await one(
      `INSERT INTO projects (id, name, builder, rera, status, units, possession)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, name, builder || null, rera || null, status || 'Draft', units || 0, possession || null]
    );
    await recordAudit(`Project ${name} created`, req.user.id, 'project', id);
    res.status(201).json({ project });
  })
);

router.patch(
  '/:id',
  requirePermission('projects:write'),
  asyncHandler(async (req, res) => {
    const project = await one(
      `UPDATE projects SET
         name = COALESCE($2, name), builder = COALESCE($3, builder),
         rera = COALESCE($4, rera), status = COALESCE($5, status),
         units = COALESCE($6, units), possession = COALESCE($7, possession),
         brochure_url = COALESCE($8, brochure_url)
       WHERE id = $1 RETURNING *`,
      [
        req.params.id, req.body.name ?? null, req.body.builder ?? null, req.body.rera ?? null,
        req.body.status ?? null, req.body.units ?? null, req.body.possession ?? null,
        req.body.brochureUrl ?? null,
      ]
    );
    if (!project) return res.status(404).json({ error: 'Project not found' });
    await recordAudit(`Project ${project.name} updated`, req.user.id, 'project', project.id);
    res.json({ project });
  })
);

export default router;
