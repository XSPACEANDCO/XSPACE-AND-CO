import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { many } from '../db.js';
import { config } from '../config.js';
import { asyncHandler, requireModule } from '../middleware.js';
import { tick } from '../automations.js';

/* The automations' own surface: what was emailed, and a way to run the
   scheduled steps on demand. */

/* POST /api/automations/tick — for an external cron (cron-job.org, a GitHub
   Action, Render's cron) sending `Authorization: Bearer <CRON_SECRET>`. A
   free Render instance sleeps when idle and its in-process timer with it;
   this call wakes it and runs the reminders. Mounted before the token gate,
   because the cron has a shared secret, not a login. */
export const cronRouter = Router();

function secretMatches(given) {
  const expected = config.automations.cronSecret;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

cronRouter.post(
  '/tick',
  asyncHandler(async (req, res, next) => {
    const header = req.get('authorization') || '';
    const given = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    /* No secret: fall through to the signed-in route below. */
    if (!secretMatches(given)) return next();
    res.json({ ran: await tick() });
  })
);

const router = Router();

/* Founder/Core: the email log, newest first. ?code=RP-05 or ?q=someone@ to
   narrow it. */
router.get(
  '/emails',
  requireModule('team'),
  asyncHandler(async (req, res) => {
    const code = String(req.query.code || '').trim().toUpperCase();
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const rows = await many(
      `SELECT e.id, e.code, e.to_email, e.subject, e.status, e.error, e.created_at,
              u.name AS user_name, u.role AS user_role
         FROM email_log e
         LEFT JOIN users u ON u.id = e.user_id
        WHERE ($1 = '' OR e.code LIKE $1 || '%')
          AND ($2 = '' OR e.to_email ILIKE '%' || $2 || '%' OR e.subject ILIKE '%' || $2 || '%')
        ORDER BY e.created_at DESC
        LIMIT $3`,
      [code, q, limit]
    );
    res.json({ emails: rows, delivering: Boolean(config.email.resendApiKey) });
  })
);

/* Founder/Core: run the scheduled steps now rather than waiting for the timer. */
router.post(
  '/tick',
  requireModule('team'),
  asyncHandler(async (req, res) => {
    res.json({ ran: await tick() });
  })
);

export default router;
