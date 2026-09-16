import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { many, one } from '../db.js';
import { asyncHandler, requireModule, requirePermission } from '../middleware.js';
import { hashPassword } from '../auth.js';
import { config } from '../config.js';
import { canCreateRole, isInternal, INTERNAL_ROLES, ROLES } from '../rbac.js';
import { newId, recordAudit } from '../helpers.js';
import { publicUser } from './auth.js';

const router = Router();

/* Partner directories grow, so these paginate. Defaults are small on purpose —
   a 500-row JSON payload is nobody's friend. */
function pagination(req) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  return { limit, offset: (page - 1) * limit, page };
}

/* Readable but unguessable — this is handed over in a chat message, not typed
   from memory, so length matters more than shape. */
function generatePassword() {
  return randomBytes(9).toString('base64url');
}

for (const role of ['creator', 'realtor', 'studio']) {
  router.get(
    `/${role}s`,
    requireModule('team'),
    asyncHandler(async (req, res) => {
      const { limit, offset, page } = pagination(req);
      const q = (req.query.q || '').trim();
      /* 'active' | 'inactive' | 'all' */
      const status = req.query.status || 'all';

      const rows = await many(
        `SELECT u.id, u.name, u.email, u.username, u.phone, u.role, u.presence, u.active,
                u.areas, u.platform, u.handle, u.skill, u.kyc_status, u.created_at,
                COUNT(DISTINCT l.id)::int AS lead_count,
                COUNT(DISTINCT li.id)::int AS listing_count,
                COUNT(DISTINCT m.id)::int AS media_count,
                COALESCE(SUM(c.amount) FILTER (WHERE c.status <> 'paid'), 0) AS commission_pending
           FROM users u
           LEFT JOIN leads l ON l.assigned_to = u.id OR l.created_by = u.id
           LEFT JOIN listings li ON li.submitted_by = u.id
           LEFT JOIN media m ON m.uploaded_by = u.id
           LEFT JOIN commissions c ON c.user_id = u.id
          WHERE u.role = $1
            AND ($2 = 'all' OR ($2 = 'active') = u.active)
            AND ($3 = '' OR u.name ILIKE '%' || $3 || '%' OR u.email ILIKE '%' || $3 || '%')
          GROUP BY u.id
          ORDER BY u.name
          LIMIT $4 OFFSET $5`,
        [role, status, q, limit, offset]
      );

      const { total } = await one(
        `SELECT COUNT(*)::int AS total FROM users
          WHERE role = $1 AND ($2 = 'all' OR ($2 = 'active') = active)
            AND ($3 = '' OR name ILIKE '%' || $3 || '%' OR email ILIKE '%' || $3 || '%')`,
        [role, status, q]
      );

      res.json({ partners: rows, page, limit, total, pages: Math.ceil(total / limit) });
    })
  );
}

/* Core team directory — Founder and Core. */
router.get(
  '/team',
  requireModule('team'),
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT id, name, email, username, phone, role, presence, active, kyc_status, created_at
         FROM users WHERE role = ANY($1) ORDER BY role, name`,
      [INTERNAL_ROLES]
    );

    /* A Founder sees every credential; a Core member does not get the
       Founder's login name. The UI hides it too, but this is the copy that
       matters — the other one is only paint. */
    const visible = rows.map((u) =>
      req.user.role === 'core' && u.role === 'founder' ? { ...u, username: null } : u
    );

    res.json({
      team: visible,
      cap: config.maxInternalAccounts,
      used: rows.filter((u) => u.active).length,
    });
  })
);

router.get(
  '/partner-dashboards',
  requireModule('partnerDashboards'),
  asyncHandler(async (req, res) => {
    const { limit, offset, page } = pagination(req);
    const rows = await many(
      `SELECT u.id, u.name, u.role, u.active,
              COUNT(DISTINCT l.id)::int AS leads,
              COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'Closed')::int AS conversions,
              COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'Completed')::int AS visits_completed,
              COUNT(DISTINCT m.id)::int AS media_uploaded,
              COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'paid'), 0) AS commission_paid
         FROM users u
         LEFT JOIN leads l ON l.assigned_to = u.id OR l.created_by = u.id
         LEFT JOIN visits v ON v.assigned_to = u.id
         LEFT JOIN media m ON m.uploaded_by = u.id
         LEFT JOIN commissions c ON c.user_id = u.id
        WHERE u.role <> ALL($1)
        GROUP BY u.id
        ORDER BY u.role, u.name
        LIMIT $2 OFFSET $3`,
      [INTERNAL_ROLES, limit, offset]
    );
    res.json({ dashboards: rows, page, limit });
  })
);

/* Own profile + KYC. Partners can edit their details but never their own role,
   KYC status or active flag. */
router.get(
  '/me/profile',
  requireModule('profileKyc'),
  asyncHandler(async (req, res) => {
    const user = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);
    res.json({ user: publicUser(user) });
  })
);

router.patch(
  '/me/profile',
  requireModule('profileKyc'),
  asyncHandler(async (req, res) => {
    const user = await one(
      `UPDATE users SET
         name = COALESCE($2, name), phone = COALESCE($3, phone),
         presence = COALESCE($4, presence), areas = COALESCE($5, areas),
         platform = COALESCE($6, platform), handle = COALESCE($7, handle),
         skill = COALESCE($8, skill)
       WHERE id = $1 RETURNING *`,
      [
        req.user.id, req.body.name ?? null, req.body.phone ?? null, req.body.presence ?? null,
        req.body.areas ?? null, req.body.platform ?? null, req.body.handle ?? null,
        req.body.skill ?? null,
      ]
    );
    res.json({ user: publicUser(user) });
  })
);

/* ---------------------------------------------------------------------------
   Creating an account — the only way anyone gets in.

   The Founder (or a Core member, for partners) fills this in and passes the
   email and password to the person. Nobody signs themselves up.
   --------------------------------------------------------------------------- */
router.post(
  '/',
  requirePermission('users:invite'),
  asyncHandler(async (req, res) => {
    const { name, email, role, password, phone, areas, platform, handle, skill } = req.body || {};
    const username = String(req.body?.username || '').trim().toLowerCase();
    if (!name || !email || !role || !username) {
      return res.status(400).json({ error: 'name, username, email and role are required' });
    }
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Unknown role' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'That email address does not look valid' });
    }
    /* This is typed at a login box, often on a phone. Keep it to characters
       that survive that trip. */
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return res.status(400).json({
        error: 'Username must be 3–32 characters: letters, digits, dot, dash or underscore',
      });
    }
    if (password && password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    /* The whole hierarchy, in one check — see CAN_CREATE_ROLES in rbac.js. */
    if (!canCreateRole(req.user.role, role)) {
      return res.status(403).json({
        error: `Your role cannot create ${role} accounts`,
      });
    }

    if (isInternal(role)) {
      /* Founder and Core are meant to be a fixed set of about ten people. A
         guardrail against a mistake or a stolen Founder token, not a business
         rule — raise MAX_INTERNAL_ACCOUNTS if the team genuinely grows. */
      const { n } = await one(
        'SELECT COUNT(*)::int AS n FROM users WHERE role = ANY($1) AND active',
        [INTERNAL_ROLES]
      );
      if (n >= config.maxInternalAccounts) {
        return res.status(409).json({
          error:
            `Internal account limit reached (${n}/${config.maxInternalAccounts}). ` +
            `Deactivate someone, or raise MAX_INTERNAL_ACCOUNTS.`,
        });
      }
    }

    const existing = await one('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
    if (existing) return res.status(409).json({ error: 'That email is already registered' });

    const taken = await one('SELECT id FROM users WHERE lower(username) = $1', [username]);
    if (taken) return res.status(409).json({ error: 'That username is already taken' });

    /* Either the Founder picked a password to read out, or we generate one. */
    const issued = password || generatePassword();
    const id = newId('u');
    const user = await one(
      `INSERT INTO users
         (id, name, email, username, password_hash, role, phone, areas, platform, handle,
          skill, created_by, active)
       VALUES ($1,$2,lower($3),$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE) RETURNING *`,
      [
        id, name, email, username, await hashPassword(issued), role, phone || null,
        areas || null, platform || null, handle || null, skill || null, req.user.id,
      ]
    );
    await recordAudit(`${role} account created for ${email}`, req.user.id, 'user', id);

    /* Shown once. Only the bcrypt hash is stored, so it cannot be read back —
       if it is lost, reset it rather than looking it up. */
    res.status(201).json({
      user: publicUser(user),
      password: issued,
      note: 'Give these to them directly. The password is only stored as a hash.',
    });
  })
);

/* Reset someone's password and hand them a new one. */
router.post(
  '/:id/reset-password',
  requirePermission('users:invite'),
  asyncHandler(async (req, res) => {
    const target = await one('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    /* Same rule as creation: you can reset a password for any role you could
       have created. Core looks after partners; only a Founder touches Core. */
    if (!canCreateRole(req.user.role, target.role)) {
      return res.status(403).json({
        error: `Your role cannot reset a ${target.role} password`,
      });
    }
    if (req.body?.password && req.body.password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const issued = req.body?.password || generatePassword();
    await one('UPDATE users SET password_hash = $2 WHERE id = $1 RETURNING id', [
      target.id,
      await hashPassword(issued),
    ]);
    await recordAudit(`Password reset for ${target.email}`, req.user.id, 'user', target.id);
    res.json({ password: issued, note: 'Shown once — only the hash is stored.' });
  })
);

/* Role, KYC and deactivation — Founder only. */
router.patch(
  '/:id',
  requirePermission('users:write'),
  asyncHandler(async (req, res) => {
    const { role, kycStatus, active } = req.body || {};

    if (req.params.id === req.user.id && active === false) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }

    const target = await one('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    /* Promoting a partner into the internal team counts against the cap. */
    if (role && isInternal(role) && !isInternal(target.role)) {
      const { n } = await one(
        'SELECT COUNT(*)::int AS n FROM users WHERE role = ANY($1) AND active',
        [INTERNAL_ROLES]
      );
      if (n >= config.maxInternalAccounts) {
        return res.status(409).json({
          error: `Internal account limit reached (${n}/${config.maxInternalAccounts}).`,
        });
      }
    }

    /* Don't let the last Founder be demoted or switched off. */
    if (target.role === 'founder' && ((role && role !== 'founder') || active === false)) {
      const { n } = await one(
        "SELECT COUNT(*)::int AS n FROM users WHERE role = 'founder' AND active AND id <> $1",
        [target.id]
      );
      if (n === 0) {
        return res.status(409).json({ error: 'That is the only active Founder' });
      }
    }

    const user = await one(
      `UPDATE users SET
         role = COALESCE($2, role),
         kyc_status = COALESCE($3, kyc_status),
         active = COALESCE($4, active)
       WHERE id = $1 RETURNING *`,
      [req.params.id, role ?? null, kycStatus ?? null, active ?? null]
    );
    await recordAudit(`User ${user.name} updated`, req.user.id, 'user', user.id);
    res.json({ user: publicUser(user) });
  })
);

export default router;
