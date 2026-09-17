import { Router } from 'express';
import { many } from '../db.js';
import { asyncHandler } from '../middleware.js';
import { canAccess, seesEverything } from '../rbac.js';

const router = Router();

/* Global search.

   The top bar has had a search box since the portal was a static mock, but it
   was never wired to anything — typing in it did nothing at all. This is what
   it now calls.

   Two rules hold everything together:

     - you can only search a module you can open, so a realtor searching does
       not get CRM rows back just because the query matched;
     - within a module, the same row scoping as the module's own page applies,
       so a partner matches only their own records.

   Both are applied in SQL, not after the fact. A row somebody may not see is
   never loaded, so it cannot leak through a count or a stray field. */

const LIMIT_PER_GROUP = 6;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    /* One character matches almost everything and is never a real search. */
    if (q.length < 2) return res.json({ query: q, groups: [] });

    const like = `%${q}%`;
    const all = seesEverything(req.user.role);
    const me = req.user.id;
    const groups = [];

    /* ---- Clients / leads ---- */
    if (canAccess('crm', req.user.role)) {
      const rows = await many(
        `SELECT id, name, phone, status, budget, preferred_area
           FROM leads
          WHERE (name ILIKE $1 OR phone ILIKE $1 OR preferred_area ILIKE $1 OR notes ILIKE $1)
            AND ($2::boolean OR assigned_to = $3 OR created_by = $3)
          ORDER BY created_at DESC
          LIMIT ${LIMIT_PER_GROUP}`,
        [like, all, me]
      );
      if (rows.length) {
        groups.push({
          key: 'clients',
          label: 'Clients',
          items: rows.map((r) => ({
            id: r.id,
            title: r.name,
            subtitle: [r.phone, r.preferred_area, r.budget].filter(Boolean).join(' · ') || null,
            badge: r.status,
            to: `/clients/${r.id}`,
          })),
        });
      }
    }

    /* ---- Listings ---- */
    if (canAccess('listings', req.user.role)) {
      const rows = await many(
        `SELECT id, title, area, price, verified, builder
           FROM listings
          WHERE (title ILIKE $1 OR area ILIKE $1 OR builder ILIKE $1 OR rera_number ILIKE $1)
            AND ($2::boolean OR assigned_to = $3 OR submitted_by = $3)
          ORDER BY created_at DESC
          LIMIT ${LIMIT_PER_GROUP}`,
        [like, all, me]
      );
      if (rows.length) {
        groups.push({
          key: 'listings',
          label: 'Listings',
          items: rows.map((r) => ({
            id: r.id,
            title: r.title,
            subtitle: [r.area, r.builder, r.price].filter(Boolean).join(' · ') || null,
            badge: r.verified ? 'Verified' : 'Unverified',
            to: `/listings/${r.id}`,
          })),
        });
      }
    }

    /* ---- Projects ---- */
    if (canAccess('projects', req.user.role)) {
      const rows = await many(
        `SELECT id, name, builder, status, rera
           FROM projects
          WHERE name ILIKE $1 OR builder ILIKE $1 OR rera ILIKE $1
          ORDER BY created_at DESC
          LIMIT ${LIMIT_PER_GROUP}`,
        [like]
      );
      if (rows.length) {
        groups.push({
          key: 'projects',
          label: 'Projects',
          items: rows.map((r) => ({
            id: r.id,
            title: r.name,
            subtitle: [r.builder, r.rera].filter(Boolean).join(' · ') || null,
            badge: r.status,
            to: '/projects',
          })),
        });
      }
    }

    /* ---- People ---- */
    if (canAccess('team', req.user.role)) {
      const rows = await many(
        `SELECT id, name, email, username, role, active
           FROM users
          WHERE name ILIKE $1 OR email ILIKE $1 OR username ILIKE $1
          ORDER BY name
          LIMIT ${LIMIT_PER_GROUP}`,
        [like]
      );
      if (rows.length) {
        groups.push({
          key: 'people',
          label: 'People',
          items: rows.map((r) => ({
            id: r.id,
            title: r.name,
            subtitle: [r.username, r.email].filter(Boolean).join(' · ') || null,
            badge: r.active ? r.role : 'deactivated',
            to: '/teams',
          })),
        });
      }
    }

    /* ---- Media ---- */
    if (canAccess('rawMedia', req.user.role) || canAccess('mediaLibrary', req.user.role)) {
      const rows = await many(
        `SELECT id, title, kind, status
           FROM media
          WHERE (title ILIKE $1 OR note ILIKE $1)
            AND ($2::boolean OR uploaded_by = $3 OR claimed_by = $3)
          ORDER BY created_at DESC
          LIMIT ${LIMIT_PER_GROUP}`,
        [like, all, me]
      );
      if (rows.length) {
        groups.push({
          key: 'media',
          label: 'Media',
          items: rows.map((r) => ({
            id: r.id,
            title: r.title,
            subtitle: r.kind,
            badge: r.status,
            to: r.status === 'approved' || r.status === 'delivered' ? '/media-library' : '/raw-media',
          })),
        });
      }
    }

    res.json({ query: q, groups });
  })
);

export default router;
