import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { many, one, query } from '../db.js';
import { asyncHandler, requireModule, requirePermission } from '../middleware.js';
import { hashPassword } from '../auth.js';
import { config } from '../config.js';
import { canAdminister, canCreateRole, isInternal, INTERNAL_ROLES, ROLES } from '../rbac.js';
import { newId, notify, recordAudit, safeUrl } from '../helpers.js';
import { publicUser } from './auth.js';
import * as automations from '../automations.js';

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
        `SELECT u.id, u.name, u.email, u.username, u.phone, u.role, CASE
                  WHEN u.last_seen_at IS NULL THEN 'offline'
                  WHEN u.last_seen_at > now() - interval '2 minutes' THEN 'online'
                  WHEN u.last_seen_at > now() - interval '15 minutes' THEN 'away'
                  ELSE 'offline'
                END AS presence, u.last_seen_at, u.active,
                u.areas, u.platform, u.handle, u.skill, u.kyc_status, u.created_at,
                u.first_login_at, u.onboarding_completed_at, u.onboarding_reminders,
                u.onboarding_escalated_at, u.rules_ack_at,
                /* One subquery per table. Joining all four and grouping
                   multiplied every row by every other — a partner with 3
                   leads and 2 listings showed their commission 6 times. */
                (SELECT COUNT(*) FROM leads l
                  WHERE l.assigned_to = u.id OR l.created_by = u.id)::int AS lead_count,
                (SELECT COUNT(*) FROM listings li WHERE li.submitted_by = u.id)::int AS listing_count,
                (SELECT COUNT(*) FROM media m WHERE m.uploaded_by = u.id)::int AS media_count,
                (SELECT COALESCE(SUM(c.amount), 0) FROM commissions c
                  WHERE c.user_id = u.id AND c.status <> 'paid') AS commission_pending
           FROM users u
          WHERE u.role = $1
            AND ($2 = 'all' OR ($2 = 'active') = u.active)
            AND ($3 = '' OR u.name ILIKE '%' || $3 || '%' OR u.email ILIKE '%' || $3 || '%')
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
      `SELECT id, name, email, username, phone, role, CASE
                WHEN last_seen_at IS NULL THEN 'offline'
                WHEN last_seen_at > now() - interval '2 minutes' THEN 'online'
                WHEN last_seen_at > now() - interval '15 minutes' THEN 'away'
                ELSE 'offline'
              END AS presence, last_seen_at, active, kyc_status, created_at
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

/* Every partner's numbers side by side, for Founder and Core.

   Each figure is the same thing that partner's own dashboard counts, so the
   Founder sees what the partner sees — computed here in SQL rather than by
   loading every partner's records into the browser. One correlated subquery
   per figure: joining leads, visits, media and commissions together and
   grouping would multiply each count by the others.

   Qualified = a lead that has reached "Listings Presented" or later and was
   not dropped (src/leadStatus.js). */
router.get(
  '/partner-dashboards',
  requireModule('partnerDashboards'),
  asyncHandler(async (req, res) => {
    const qualified = ['Listings Presented', 'Visit Scheduled', 'Visit Completed', 'Negotiation', 'Token/EOI', 'Closed'];
    const rows = await many(
      `SELECT u.id, u.name, u.role, u.active, u.areas, u.platform, u.handle, u.skill,
              u.kyc_status, u.kyc_submitted_at, u.rules_ack_at, u.last_seen_at, u.created_at,
              u.first_login_at, u.onboarding_completed_at, u.onboarding_reminders,
              u.onboarding_escalated_at,
              CASE
                WHEN u.last_seen_at IS NULL THEN 'offline'
                WHEN u.last_seen_at > now() - interval '2 minutes' THEN 'online'
                WHEN u.last_seen_at > now() - interval '15 minutes' THEN 'away'
                ELSE 'offline'
              END AS presence,

              /* Leads — realtors own them, creators source them. */
              (SELECT COUNT(*) FROM leads l
                WHERE l.assigned_to = u.id OR l.created_by = u.id)::int AS leads,
              (SELECT COUNT(*) FROM leads l
                WHERE (l.assigned_to = u.id OR l.created_by = u.id)
                  AND l.status = ANY($2))::int AS qualified,
              (SELECT COUNT(*) FROM leads l
                WHERE (l.assigned_to = u.id OR l.created_by = u.id)
                  AND l.status = 'Closed')::int AS deals,
              (SELECT COUNT(*) FROM leads l
                WHERE l.assigned_to = u.id AND l.status NOT IN ('Closed','Dropped')
                  AND l.follow_up_at < date_trunc('day', now()))::int AS followups_overdue,
              (SELECT COUNT(*) FROM leads l
                WHERE l.created_by = u.id AND l.source_media_id IS NOT NULL)::int AS leads_from_content,

              /* Realtor field work. */
              (SELECT COUNT(*) FROM visits v
                WHERE v.assigned_to = u.id AND v.status = 'Completed')::int AS visits_completed,
              (SELECT COUNT(*) FROM visits v
                WHERE v.assigned_to = u.id AND v.status IN ('Scheduled','Rescheduled')
                  AND v.scheduled_at >= date_trunc('day', now()))::int AS visits_upcoming,
              (SELECT COUNT(*) FROM listings li WHERE li.submitted_by = u.id)::int AS listings,
              (SELECT COUNT(*) FROM listings li
                WHERE li.submitted_by = u.id AND li.verified)::int AS listings_verified,
              (SELECT COUNT(*) FROM area_updates au
                WHERE au.user_id = u.id AND au.created_at > now() - interval '30 days')::int AS area_updates_30d,

              /* Creator content. */
              (SELECT COUNT(*) FROM media m WHERE m.uploaded_by = u.id)::int AS content_submitted,
              (SELECT COUNT(*) FROM media m
                WHERE m.uploaded_by = u.id AND m.status = 'approved')::int AS content_published,
              (SELECT COALESCE(SUM(m.views), 0) FROM media m
                WHERE m.uploaded_by = u.id AND m.status = 'approved')::bigint AS reach,

              /* Studio production — work this editor has claimed. */
              (SELECT COUNT(*) FROM media m
                WHERE m.claimed_by = u.id AND m.status IN ('in_progress','qc'))::int AS in_production,
              (SELECT COUNT(*) FROM media m
                WHERE m.claimed_by = u.id AND m.status = 'delivered')::int AS awaiting_approval,
              (SELECT COUNT(*) FROM media m
                WHERE m.claimed_by = u.id AND m.status = 'changes_requested')::int AS revisions,
              (SELECT COUNT(*) FROM media m
                WHERE m.claimed_by = u.id AND m.status = 'approved'
                  AND m.reviewed_at > now() - interval '30 days')::int AS approved_30d,
              (SELECT COUNT(*) FROM media m
                WHERE m.claimed_by = u.id
                  AND m.status IN ('pending','in_progress','qc','changes_requested')
                  AND m.due_at < now())::int AS overdue,

              (SELECT COALESCE(SUM(c.amount), 0) FROM commissions c
                WHERE c.user_id = u.id AND c.status <> 'paid')::float AS commission_due,
              (SELECT COALESCE(SUM(c.amount), 0) FROM commissions c
                WHERE c.user_id = u.id AND c.status = 'paid')::float AS commission_paid
         FROM users u
        WHERE u.role <> ALL($1)
        ORDER BY u.role, u.name
        LIMIT 500`,
      [INTERNAL_ROLES, qualified]
    );
    res.json({ dashboards: rows });
  })
);

/* Own profile. Every signed-in role can read and edit their own name, phone
   and photo — this is not the same thing as the "Profile & KYC" sidebar
   module (bank details, KYC documents), which stays partner-only. It used to
   share that module's gate, which is why a Founder or Core member opening
   the profile popup from the top bar got "Your role cannot access
   profileKyc" back for trying to edit their own name: that gate was built
   for the KYC screen, not for this. requireAuth (applied to all of /api in
   app.js) is enough here — nobody edits anyone's profile but their own,
   since every update below is scoped to req.user.id.

   Partners can edit their details but never their own role, KYC status or
   active flag — those columns are simply not in the UPDATE below. */
router.get(
  '/me/profile',
  asyncHandler(async (req, res) => {
    const user = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);
    res.json({ user: publicUser(user) });
  })
);

router.patch(
  '/me/profile',
  asyncHandler(async (req, res) => {
    if ('name' in (req.body || {}) && !String(req.body.name || '').trim()) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }
    /* Presence is derived from activity (requireAuth), never set by hand. */
    if (req.body) delete req.body.presence;
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
   KYC.

   A partner submits identity and payout details; Founder or Core verify or
   send it back with a reason. Submitting (or resubmitting) always returns the
   account to 'pending', so changing a bank account after verification cannot
   quietly inherit the old approval.
   --------------------------------------------------------------------------- */
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_RE = /^[\w.-]+@[a-zA-Z]{2,}$/;

function text(v) {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

router.post(
  '/me/kyc',
  asyncHandler(async (req, res) => {
    if (isInternal(req.user.role)) {
      return res.status(400).json({ error: 'KYC is for partner accounts' });
    }
    const b = req.body || {};
    const pan = text(b.panNumber)?.toUpperCase() || null;
    const aadhaar = text(b.aadhaarLast4);
    const ifsc = text(b.bankIfsc)?.toUpperCase() || null;
    const account = text(b.bankAccount)?.replace(/\s+/g, '') || null;
    const upi = text(b.upiId);

    const problems = [];
    if (!pan || !PAN_RE.test(pan)) problems.push('a valid PAN (e.g. ABCDE1234F)');
    if (!aadhaar || !/^\d{4}$/.test(aadhaar)) problems.push('the last 4 digits of Aadhaar');
    if (!safeUrl(b.panDocUrl)) problems.push('a copy of the PAN card');
    if (!safeUrl(b.aadhaarDocUrl)) problems.push('a copy of the Aadhaar card');
    if (!text(b.address)) problems.push('your address');
    /* Payouts need either a bank account or a UPI id — and a bank account
       needs all of its parts. */
    const hasBank = account || ifsc || text(b.bankHolder);
    if (hasBank) {
      if (!account || !/^\d{9,18}$/.test(account)) problems.push('a bank account number (9–18 digits)');
      if (!ifsc || !IFSC_RE.test(ifsc)) problems.push('a valid IFSC (e.g. HDFC0001234)');
      if (!text(b.bankHolder)) problems.push("the account holder's name");
    }
    if (upi && !UPI_RE.test(upi)) problems.push('a valid UPI id (e.g. name@okhdfc)');
    if (!hasBank && !upi) problems.push('bank details or a UPI id for payouts');
    if (problems.length) {
      return res.status(400).json({ error: `Please provide ${problems.join(', ')}.` });
    }

    const user = await one(
      `UPDATE users SET
         pan_number = $2, aadhaar_last4 = $3, address = $4, rera_agent_no = $5,
         pan_doc_url = $6, aadhaar_doc_url = $7,
         bank_holder = $8, bank_account = $9, bank_ifsc = $10, bank_name = $11, upi_id = $12,
         kyc_status = 'pending', kyc_submitted_at = now(), kyc_note = NULL,
         kyc_reviewed_at = NULL, kyc_reviewed_by = NULL
       WHERE id = $1 RETURNING *`,
      [
        req.user.id, pan, aadhaar, text(b.address), text(b.reraAgentNo),
        text(b.panDocUrl), text(b.aadhaarDocUrl),
        text(b.bankHolder), account, ifsc, text(b.bankName), upi,
      ]
    );

    for (const role of INTERNAL_ROLES) {
      await notify({ role, type: 'kyc', title: `KYC submitted by ${user.name}`, body: `${user.role} partner — review in Profile & KYC` });
    }
    await recordAudit(`KYC submitted by ${user.name}`, req.user.id, 'user', user.id);
    res.json({ user: publicUser(user) });
  })
);

/* Partners and their KYC, for Founder and Core to review. Submitted and
   waiting first. */
router.get(
  '/kyc-queue',
  requireModule('team'),
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.kyc_status, u.kyc_note,
              u.kyc_submitted_at, u.kyc_reviewed_at, rv.name AS kyc_reviewed_by_name,
              u.pan_number, u.aadhaar_last4, u.address, u.rera_agent_no,
              u.pan_doc_url, u.aadhaar_doc_url,
              u.bank_holder, u.bank_account, u.bank_ifsc, u.bank_name, u.upi_id,
              u.rules_ack_at
         FROM users u
         LEFT JOIN users rv ON rv.id = u.kyc_reviewed_by
        WHERE u.role = ANY($1) AND u.active
        ORDER BY
          CASE WHEN u.kyc_status = 'pending' AND u.kyc_submitted_at IS NOT NULL THEN 0
               WHEN u.kyc_status = 'pending' THEN 2
               ELSE 1 END,
          u.kyc_submitted_at DESC NULLS LAST, u.name`,
      [['realtor', 'creator', 'studio']]
    );
    res.json({ partners: rows });
  })
);

router.post(
  '/:id/kyc-review',
  requirePermission('users:invite'),
  asyncHandler(async (req, res) => {
    const { decision } = req.body || {};
    const note = text(req.body?.note);
    if (!['verify', 'reject'].includes(decision)) {
      return res.status(400).json({ error: "decision must be 'verify' or 'reject'" });
    }
    if (decision === 'reject' && !note) {
      return res.status(400).json({ error: 'Say what needs fixing — the partner only sees this note' });
    }

    const target = await one('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!canAdminister(req.user.role, target.role)) {
      return res.status(403).json({ error: `Your role cannot review a ${target.role} account` });
    }
    if (!target.kyc_submitted_at) {
      return res.status(409).json({ error: 'This partner has not submitted KYC yet' });
    }

    const user = await one(
      `UPDATE users SET kyc_status = $2, kyc_note = $3, kyc_reviewed_at = now(), kyc_reviewed_by = $4
        WHERE id = $1 RETURNING *`,
      [target.id, decision === 'verify' ? 'verified' : 'rejected', note, req.user.id]
    );
    await notify({
      userId: user.id,
      type: 'kyc',
      title: decision === 'verify' ? 'Your KYC is verified' : 'Your KYC needs changes',
      body: note,
    });
    /* Verifying KYC may be the last onboarding step; sending it back gives
       the member something to do again, which restarts their reminders. */
    if (decision === 'verify') await automations.checkOnboarding(user.id);
    else await automations.kycRejected(user.id);
    await recordAudit(
      `KYC for ${user.name} ${decision === 'verify' ? 'verified' : 'sent back'}`,
      req.user.id,
      'user',
      user.id
    );
    res.json({ user: publicUser(user) });
  })
);

/* "I have read the rules for my role." */
router.post(
  '/me/rules-ack',
  asyncHandler(async (req, res) => {
    const user = await one('UPDATE users SET rules_ack_at = now() WHERE id = $1 RETURNING *', [req.user.id]);
    await recordAudit(`${user.name} acknowledged the partner rules`, req.user.id, 'user', user.id);
    await automations.checkOnboarding(user.id);
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
    const { name, email, role, phone, areas, platform, handle, skill } = req.body || {};
    /* Trimmed to match the login route, which ignores surrounding spaces. */
    const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
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

    /* Welcome and portal-access emails. Not awaited: the account exists
       whether or not the email provider answers promptly. */
    automations.accountCreated(user, issued);

    /* Shown once. Only the bcrypt hash is stored, so it cannot be read back —
       if it is lost, reset it rather than looking it up. */
    res.status(201).json({
      user: publicUser(user),
      password: issued,
      note:
        config.email.resendApiKey && !isInternal(role)
          ? 'Their sign-in details have also been emailed to them. The password is only stored as a hash.'
          : 'Give these to them directly. The password is only stored as a hash.',
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
    const chosen = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
    if (chosen && chosen.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const issued = chosen || generatePassword();
    /* token_version moves on, so anyone still signed in with the old
       password is signed out on their next request. */
    await one(
      'UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1 RETURNING id',
      [target.id, await hashPassword(issued)]
    );
    await recordAudit(`Password reset for ${target.email}`, req.user.id, 'user', target.id);
    automations.passwordReset(target.id, issued);
    res.json({ password: issued, note: 'Shown once — only the hash is stored.' });
  })
);

/* Role, KYC and deactivation. */
router.patch(
  '/:id',
  requirePermission('users:write'),
  asyncHandler(async (req, res) => {
    const { role, kycStatus, active } = req.body || {};
    if (kycStatus !== undefined && !['pending', 'verified', 'rejected'].includes(kycStatus)) {
      return res.status(400).json({ error: 'Unknown KYC status' });
    }
    if (active !== undefined && typeof active !== 'boolean') {
      return res.status(400).json({ error: 'active must be true or false' });
    }
    if (role !== undefined && !ROLES.includes(role)) {
      return res.status(400).json({ error: 'Unknown role' });
    }

    if (req.params.id === req.user.id && active === false) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }

    const target = await one('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    /* Core can administer partners; only a Founder administers Founders and
       Core. Without this, Core reaching every module would also mean Core
       could switch off a Founder. */
    if (!canAdminister(req.user.role, target.role)) {
      return res.status(403).json({ error: `Your role cannot modify a ${target.role} account` });
    }
    /* Nor promote someone into a role you could not have created. */
    if (role && !canAdminister(req.user.role, role)) {
      return res.status(403).json({ error: `Your role cannot grant the ${role} role` });
    }

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

/* Delete the account outright — Founder only.

   This removes the row, it does not flag it. The person's work is kept but
   becomes unowned: leads, listings, visits and media they touched have their
   user reference set to NULL (see schema.sql), so the records survive with
   nobody attached. Their notifications, commissions and area updates are
   removed with them.

   The audit log keeps its entries because it stores what happened as text and
   only the actor reference is nulled — so "X verified listing Y" is still
   readable after X is gone. */
router.delete(
  '/:id',
  requirePermission('users:write'),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const target = await one('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    /* Deleting follows the same hierarchy as creating — Core deletes partners,
       only a Founder deletes a Founder or a Core member. */
    if (!canAdminister(req.user.role, target.role)) {
      return res.status(403).json({ error: `Your role cannot delete a ${target.role} account` });
    }

    if (target.role === 'founder') {
      const { n } = await one(
        "SELECT COUNT(*)::int AS n FROM users WHERE role = 'founder' AND active AND id <> $1",
        [target.id]
      );
      if (n === 0) return res.status(409).json({ error: 'That is the only active Founder' });
    }

    await query('DELETE FROM users WHERE id = $1', [target.id]);

    /* Recorded before the row goes, by name, so the log still reads properly. */
    await recordAudit(
      `User ${target.name} (${target.email}) deleted permanently`,
      req.user.id,
      'user',
      target.id
    );
    res.json({ deleted: true, id: target.id, name: target.name });
  })
);

export default router;
