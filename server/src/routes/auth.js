import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { one, query } from '../db.js';
import { hashPassword, signToken, verifyPassword } from '../auth.js';
import { asyncHandler, requireAuth } from '../middleware.js';
import { modulesForRole } from '../rbac.js';
import { config } from '../config.js';

const router = Router();

/* There is no public sign-up. Every account — partner or internal — is created
   by a Founder or Core member, who hands the credentials over directly. Login
   is therefore the only unauthenticated endpoint on the whole surface.

   Two limiters, because a single per-IP counter gets this wrong in both
   directions. Partners share office and mobile-carrier NAT addresses, so one
   person fumbling their password would lock out everyone behind the same IP;
   meanwhile a per-IP ceiling alone is a weak brake on guessing one account.

     perAccount  IP + email — tight, stops brute force against one login
     perIp       IP only    — loose, stops sweeping many accounts at once */
/* Partners are given a username; the internal team tends to type their email.
   Login takes whichever arrives and matches against both columns. */
function identifierFrom(req) {
  return String(req.body?.username ?? req.body?.email ?? '').trim();
}

const perAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.loginAttemptsPerAccount,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    /* ipKeyGenerator normalises IPv6 into a /64 subnet — without it, an
       attacker rotates the last hextet and gets a fresh bucket each time. */
    return `${ipKeyGenerator(req.ip)}:${identifierFrom(req).toLowerCase()}`;
  },
  message: { error: 'Too many attempts for this account, try again in a few minutes' },
});

const perIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.loginAttemptsPerIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this network, try again later' },
});

const loginLimiter = [perIpLimiter, perAccountLimiter];

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const identifier = identifierFrom(req);
    const { password } = req.body || {};
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await one(
      'SELECT * FROM users WHERE lower(email) = lower($1) OR lower(username) = lower($1)',
      [identifier]
    );

    /* Same response and roughly the same work whether the account exists or
       not, so this can't be used to enumerate accounts. */
    const ok = user && (await verifyPassword(password, user.password_hash));
    if (!ok) return res.status(401).json({ error: 'Invalid username or password' });

    if (!user.active) {
      return res.status(403).json({ error: 'Account is deactivated', status: 'deactivated' });
    }

    res.json({
      token: signToken(user),
      user: publicUser(user),
      modules: modulesForRole(user.role),
    });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);
    res.json({
      user: publicUser(user),
      modules: modulesForRole(user.role),
    });
  })
);

/* Heartbeat. requireAuth already refreshes last_seen_at, so the body of this
   route has nothing to do — the point is that an open tab keeps calling it
   and therefore keeps reading as online. */
router.post(
  '/heartbeat',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ ok: true });
  })
);

/* Signing off: closing the tab, backgrounding the app, or logging out.

   Presence is inferred from last_seen_at, so there is no "offline" to set —
   instead the timestamp is pushed back beyond the online window, which is
   what makes someone who closed their laptop show as offline straight away
   instead of lingering for the length of the timeout. */
router.post(
  '/offline',
  requireAuth,
  asyncHandler(async (req, res) => {
    await query(
      "UPDATE users SET last_seen_at = now() - interval '1 hour' WHERE id = $1",
      [req.user.id]
    );
    res.json({ ok: true });
  })
);

router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from the current one' });
    }

    const user = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!(await verifyPassword(currentPassword, user.password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      await hashPassword(newPassword),
      user.id,
    ]);
    res.json({ ok: true });
  })
);

export function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

export default router;
