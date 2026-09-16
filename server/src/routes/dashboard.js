import { Router } from 'express';
import { many, one, query } from '../db.js';
import { asyncHandler, requireAuth, requireModule, requirePermission } from '../middleware.js';
import { modulesForRole, seesEverything } from '../rbac.js';
import { newId, recordAudit } from '../helpers.js';

const router = Router();

/* The KPI strip, computed per role. Mirrors snapshotCards() on the frontend,
   but from SQL rather than a localStorage blob. */
router.get(
  '/snapshot',
  requireModule('dashboard'),
  asyncHandler(async (req, res) => {
    const { id, role } = req.user;
    const all = seesEverything(role);

    const [leads, listings, projects, visits, verifications, media] =
      await Promise.all([
        one(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS today,
                  COUNT(*) FILTER (WHERE status = 'Closed')::int AS closed
             FROM leads WHERE ($2::boolean IS TRUE OR assigned_to = $1 OR created_by = $1)`,
          [id, all]
        ),
        one(
          `SELECT COUNT(*)::int AS total
             FROM listings WHERE ($2::boolean IS TRUE OR assigned_to = $1 OR submitted_by = $1)`,
          [id, all]
        ),
        one('SELECT COUNT(*)::int AS total FROM projects'),
        one(
          `SELECT COUNT(*) FILTER (WHERE scheduled_at::date = current_date)::int AS today,
                  COUNT(*) FILTER (WHERE status = 'Completed'
                    AND ended_at > now() - interval '7 days')::int AS completed_week
             FROM visits WHERE ($2::boolean IS TRUE OR assigned_to = $1)`,
          [id, all]
        ),
        one(
          `SELECT COUNT(*) FILTER (WHERE status IN ('pending','inprogress','escalated'))::int AS pending,
                  COUNT(*) FILTER (WHERE status = 'verified'
                    AND finished_at > now() - interval '24 hours')::int AS verified_today,
                  COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (finished_at - started_at)) / 3600)
                    FILTER (WHERE finished_at IS NOT NULL AND started_at IS NOT NULL)), 0)::int AS avg_hours
             FROM verifications`
        ),
        one(
          `SELECT COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
                  COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
                  COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
                  COUNT(*) FILTER (WHERE uploaded_by = $1)::int AS mine
             FROM media`,
          [id]
        ),
      ]);


    const cards = {
      founder: [
        { title: 'Leads Today', num: leads.today },
        { title: 'Leads (visible)', num: leads.total },
        { title: 'Conversions', num: leads.closed },
        { title: 'Active Listings', num: listings.total },
        { title: 'Projects Live', num: projects.total },
        { title: 'Visits Today', num: visits.today },
      ],
      core: [
        { title: 'Listings Verified Today', num: verifications.verified_today },
        { title: 'Avg Verification Time (hrs)', num: verifications.avg_hours },
        { title: 'Pending Verifications', num: verifications.pending },
        { title: 'Leads Today', num: leads.today },
        { title: 'Active Listings', num: listings.total },
      ],
      realtor: [
        { title: 'Assigned Leads', num: leads.total },
        { title: 'Visits Today', num: visits.today },
        { title: 'Conversions', num: leads.closed },
        { title: 'Active Listings', num: listings.total },
      ],
      creator: [
        { title: 'Leads Uploaded', num: leads.total },
        { title: 'Converted', num: leads.closed },
        { title: 'Raw Media Submitted', num: media.mine },
        { title: 'Awaiting Edit', num: media.pending },
      ],
      studio: [
        { title: 'Raw Media In', num: media.pending },
        { title: 'Edits Pending', num: media.in_progress },
        { title: 'Delivered', num: media.delivered },
        { title: 'Projects Accessible', num: projects.total },
      ],
    };

    res.json({ role, modules: modulesForRole(role), cards: cards[role] || cards.realtor });
  })
);

/* Lead funnel, scoped the same way. */
router.get(
  '/funnel',
  requireModule('dashboard'),
  asyncHandler(async (req, res) => {
    const all = seesEverything(req.user.role);
    const rows = await many(
      `SELECT status, COUNT(*)::int AS count
         FROM leads WHERE ($2::boolean IS TRUE OR assigned_to = $1 OR created_by = $1)
        GROUP BY status`,
      [req.user.id, all]
    );
    const byStage = Object.fromEntries(rows.map((r) => [r.status, r.count]));
    const discovery = byStage.Discovery || 0;
    const engaged = byStage.Engaged || 0;

    res.json({
      stages: ['Discovery', 'Engaged', 'Site Visit', 'Decision', 'Closed'].map((s) => ({
        stage: s,
        count: byStage[s] || 0,
      })),
      conversionRate: discovery > 0 ? Math.round((engaged / discovery) * 100) : 0,
      scope: all ? 'ALL' : 'ASSIGNED',
    });
  })
);

router.get(
  '/activity',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT a.*, u.name AS actor_name FROM activity a
         LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.created_at DESC LIMIT 20`
    );
    res.json({ activity: rows });
  })
);

/* Audit log is Founder-only. It used to borrow the finances module's guard;
   that module has been removed, so the check is stated directly here. */
function founderOnly(req, res, next) {
  if (req.user.role !== 'founder') {
    return res.status(403).json({ error: 'Founder only' });
  }
  next();
}

router.get(
  '/audit',
  founderOnly,
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT a.*, u.name AS actor_name FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.created_at DESC LIMIT 100`
    );
    res.json({ audit: rows });
  })
);

/* Notifications: addressed to you personally or broadcast to your role. */
router.get(
  '/notifications',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT * FROM notifications
        WHERE user_id = $1 OR role = $2
        ORDER BY created_at DESC LIMIT 50`,
      [req.user.id, req.user.role]
    );
    res.json({
      notifications: rows,
      unread: rows.filter((n) => !n.read).length,
    });
  })
);

router.post(
  '/notifications/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    await query(
      'UPDATE notifications SET read = TRUE WHERE id = $1 AND (user_id = $2 OR role = $3)',
      [req.params.id, req.user.id, req.user.role]
    );
    res.json({ ok: true });
  })
);

/* "Keep their area updated inside portal" — realtor partners only. */
router.get(
  '/area-updates',
  requireModule('areaUpdates'),
  asyncHandler(async (req, res) => {
    const rows = await many(
      'SELECT * FROM area_updates WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ updates: rows });
  })
);

router.post(
  '/area-updates',
  requireModule('areaUpdates'),
  asyncHandler(async (req, res) => {
    const { area, note } = req.body || {};
    if (!area || !note) return res.status(400).json({ error: 'area and note are required' });

    const update = await one(
      'INSERT INTO area_updates (id, user_id, area, note) VALUES ($1,$2,$3,$4) RETURNING *',
      [newId('au'), req.user.id, area, note]
    );
    await recordAudit(`Area update for ${area}`, req.user.id, 'area_update', update.id);
    res.status(201).json({ update });
  })
);

export default router;
export { requirePermission };
