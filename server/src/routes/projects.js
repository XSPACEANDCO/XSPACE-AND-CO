import { Router } from 'express';
import { many, one } from '../db.js';
import { asyncHandler, requireModule, requirePermission } from '../middleware.js';
import { newId, recordAudit, safeUrl } from '../helpers.js';

const router = Router();

/* What a creator ("upcoming" scope) may see. One list, used by the list,
   the detail route and search, so the three cannot disagree. */
export const UPCOMING_STATUSES = ['Upcoming', 'Under Construction', 'New Launch'];
const UPCOMING_SQL = UPCOMING_STATUSES.map((s) => `'${s}'`).join(',');

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
        ${upcomingOnly ? `WHERE p.status IN (${UPCOMING_SQL})` : ''}
        GROUP BY p.id
        /* A project with no verified listing has nothing to show and no sheet
           to open — it is not part of the verified book. */
        HAVING COUNT(l.id) FILTER (WHERE l.verified) > 0
        ORDER BY p.created_at DESC`
    );
    res.json({ projects: rows, scope: req.scope });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const project = await one('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    /* The list hides non-upcoming projects from a creator; so must this. */
    if (!project || (req.scope === 'upcoming' && !UPCOMING_STATUSES.includes(project.status))) {
      return res.status(404).json({ error: 'Project not found' });
    }

    /* Verified inventory only, and finished media: 'delivered' means a cut is
       still waiting on review, which is not something to show anyone. */
    const listings = await many('SELECT * FROM listings WHERE project_id = $1 AND verified', [project.id]);
    const media = await many(
      "SELECT * FROM media WHERE project_id = $1 AND status = 'approved'",
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
    if (safeUrl(req.body?.brochureUrl) === undefined) {
      return res.status(400).json({ error: 'The brochure link must start with http:// or https://' });
    }

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
    if (safeUrl(req.body?.brochureUrl) === undefined) {
      return res.status(400).json({ error: 'The brochure link must start with http:// or https://' });
    }
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

/* Remove a project that has nothing in it. A project is created when its
   first listing is verified; if every listing under it is later deleted, an
   empty card is left on the Projects page with no sheet to open. Only an
   empty one can go — a project with any listing, verified or not, stays. */
router.delete(
  '/:id',
  requirePermission('projects:write'),
  asyncHandler(async (req, res) => {
    const project = await one('SELECT id, name FROM projects WHERE id = $1', [req.params.id]);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const { n } = await one('SELECT COUNT(*)::int AS n FROM listings WHERE project_id = $1', [project.id]);
    if (n > 0) {
      return res.status(409).json({ error: 'This project still has listings — delete or move them first' });
    }
    await one('DELETE FROM projects WHERE id = $1 RETURNING id', [project.id]);
    await recordAudit(`Empty project ${project.name} removed`, req.user.id, 'project', project.id);
    res.json({ deleted: true });
  })
);

export default router;
