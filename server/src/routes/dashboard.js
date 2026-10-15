import { Router } from 'express';
import { many, one, query } from '../db.js';
import { asyncHandler, requireAuth, requireModule, requirePermission } from '../middleware.js';
import { modulesForRole, seesEverything } from '../rbac.js';
import { FUNNEL_BUCKETS } from '../leadStatus.js';
import { newId, recordActivity, recordAudit } from '../helpers.js';

const router = Router();

/* The KPI strip, computed per role. Mirrors snapshotCards() on the frontend,
   but from SQL rather than a localStorage blob. */
router.get(
  '/snapshot',
  requireModule('dashboard'),
  asyncHandler(async (req, res) => {
    const { id, role } = req.user;
    const all = seesEverything(role);

    const [leads, listings, projects, visits, verifications] =
      await Promise.all([
        one(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date
                                      = (now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS today,
                  COUNT(*) FILTER (WHERE status = 'Closed')::int AS closed
             FROM leads WHERE ($2::boolean IS TRUE OR assigned_to = $1 OR created_by = $1)`,
          [id, all]
        ),
        /* Active = verified: an unverified listing cannot be offered yet. */
        one(
          `SELECT COUNT(*)::int AS total
             FROM listings WHERE verified AND ($2::boolean IS TRUE OR assigned_to = $1 OR submitted_by = $1)`,
          [id, all]
        ),
        /* The same projects the Projects page shows — ones with a verified listing. */
        one(
          `SELECT COUNT(*)::int AS total FROM projects p
            WHERE EXISTS (SELECT 1 FROM listings l WHERE l.project_id = p.id AND l.verified)`
        ),
        /* "Today" is the day in India, not the server's UTC day. */
        one(
          `SELECT COUNT(*) FILTER (WHERE (scheduled_at AT TIME ZONE 'Asia/Kolkata')::date
                                      = (now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS today,
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
      /* Realtor, Creator and Studio dashboards count their own KPI rows
         from the scoped records they already load — see
         src/pages/dashboard/partner/. */
    };

    res.json({ role, modules: modulesForRole(role), cards: cards[role] || [] });
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
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.count]));
    /* The pipeline has more steps than the funnel shows, so each bucket sums
       the statuses that belong to it — see src/leadStatus.js. */
    const stages = FUNNEL_BUCKETS.map((b) => ({
      stage: b.stage,
      count: b.statuses.reduce((n, st) => n + (byStatus[st] || 0), 0),
    }));
    const discovery = stages[0].count;
    const engaged = stages[1].count;

    res.json({
      stages,
      conversionRate: discovery > 0 ? Math.round((engaged / discovery) * 100) : 0,
      scope: all ? 'ALL' : 'ASSIGNED',
    });
  })
);

/* Founder and Core see the whole company's feed. A partner sees what the
   people running the company did, plus their own actions — not every other
   partner's ("TEJ added listing…" is noise to a creator in another city). */
router.get(
  '/activity',
  requireAuth,
  asyncHandler(async (req, res) => {
    const all = seesEverything(req.user.role);
    const rows = await many(
      `SELECT a.*, u.name AS actor_name, u.role AS actor_role FROM activity a
         LEFT JOIN users u ON u.id = a.actor_id
        WHERE $2::boolean IS TRUE OR a.actor_id = $1 OR u.role IN ('founder','core')
        ORDER BY a.created_at DESC LIMIT 20`,
      [req.user.id, all]
    );
    res.json({ activity: rows });
  })
);

/* What the signed-in partner has earned, from the commissions ledger. */
router.get(
  '/earnings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const totals = await one(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)::float  AS pending,
              COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0)::float AS approved,
              COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::float     AS paid,
              COUNT(*)::int AS entries
         FROM commissions WHERE user_id = $1`,
      [req.user.id]
    );
    const rows = await many(
      'SELECT * FROM commissions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ earnings: totals, commissions: rows });
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
    /* A personal notification carries its own read flag; a role-wide one is
       read per person, in notification_reads. */
    const rows = await many(
      `SELECT n.id, n.user_id, n.role, n.type, n.title, n.body, n.created_at,
              CASE WHEN n.user_id IS NOT NULL THEN n.read
                   ELSE (r.user_id IS NOT NULL) END AS read
         FROM notifications n
         LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = $1
        WHERE n.user_id = $1 OR (n.user_id IS NULL AND n.role = $2)
        ORDER BY n.created_at DESC LIMIT 50`,
      [req.user.id, req.user.role]
    );
    res.json({
      notifications: rows,
      unread: rows.filter((n) => !n.read).length,
    });
  })
);

/* One notification (id) or all of them (null) as read, for this person only.
   Marking a role-wide one used to set the shared flag, which hid it from
   everyone else in the role — one Core member clearing an alert cleared it
   for the whole team. */
async function markRead(user, id) {
  await query(
    `UPDATE notifications SET read = TRUE
      WHERE user_id = $1 AND read = FALSE AND ($2::text IS NULL OR id = $2)`,
    [user.id, id]
  );
  await query(
    `INSERT INTO notification_reads (notification_id, user_id)
     SELECT n.id, $1 FROM notifications n
      WHERE n.user_id IS NULL AND n.role = $3 AND ($2::text IS NULL OR n.id = $2)
     ON CONFLICT DO NOTHING`,
    [user.id, id, user.role]
  );
}

router.post(
  '/notifications/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    await markRead(req.user, req.params.id);
    res.json({ ok: true });
  })
);

/* Area updates — "keep their area updated inside the portal".

   A realtor partner posts what is changing on the ground in the areas they
   cover: a new launch, a price move, a flyover, a GO. They see their own
   feed; Founder and Core see everyone's, which is the point — it is how the
   company knows twelve micro-markets at once. */
const AREA_CATEGORIES = ['launch', 'price', 'infrastructure', 'inventory', 'regulation', 'market'];

router.get(
  '/area-updates',
  requireModule('areaUpdates'),
  asyncHandler(async (req, res) => {
    const all = seesEverything(req.user.role);
    const rows = await many(
      `SELECT au.*, u.name AS user_name
         FROM area_updates au
         LEFT JOIN users u ON u.id = au.user_id
        WHERE $2::boolean IS TRUE OR au.user_id = $1
        ORDER BY au.created_at DESC
        LIMIT 300`,
      [req.user.id, all]
    );
    res.json({ updates: rows, categories: AREA_CATEGORIES, scope: all ? 'all' : 'own' });
  })
);

router.post(
  '/area-updates',
  requireModule('areaUpdates'),
  asyncHandler(async (req, res) => {
    const area = String(req.body?.area || '').trim();
    const note = String(req.body?.note || '').trim();
    const category = req.body?.category || 'market';
    const link = String(req.body?.link || '').trim() || null;
    if (!area || !note) return res.status(400).json({ error: 'area and note are required' });
    if (!AREA_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of ${AREA_CATEGORIES.join(', ')}` });
    }
    if (link && !/^https?:\/\//i.test(link)) {
      return res.status(400).json({ error: 'The link must start with http:// or https://' });
    }

    const update = await one(
      `INSERT INTO area_updates (id, user_id, area, note, category, link)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [newId('au'), req.user.id, area, note, category, link]
    );
    await recordActivity(`${req.user.name} posted an area update for ${area}`, req.user.id);
    await recordAudit(`Area update for ${area}`, req.user.id, 'area_update', update.id);
    res.status(201).json({ update: { ...update, user_name: req.user.name } });
  })
);

/* Your own, or anyone's if you are Founder/Core. */
router.delete(
  '/area-updates/:id',
  requireModule('areaUpdates'),
  asyncHandler(async (req, res) => {
    const row = await one(
      `DELETE FROM area_updates
        WHERE id = $1 AND ($3::boolean IS TRUE OR user_id = $2)
        RETURNING id, area`,
      [req.params.id, req.user.id, seesEverything(req.user.role)]
    );
    if (!row) return res.status(404).json({ error: 'Update not found' });
    await recordAudit(`Area update for ${row.area} deleted`, req.user.id, 'area_update', row.id);
    res.json({ deleted: true });
  })
);

/* Clear the bell in one go — from Settings. */
router.post(
  '/notifications/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await markRead(req.user, null);
    res.json({ ok: true });
  })
);

export default router;
export { requirePermission };
