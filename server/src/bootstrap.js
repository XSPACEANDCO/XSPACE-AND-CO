import { one, query } from './db.js';
import { hashPassword } from './auth.js';
import { config } from './config.js';
import { newId, recordAudit } from './helpers.js';

/* Creates the first Founder account from environment variables.

   Render's free tier gives you no shell, so there is otherwise no way to get
   a first user into a fresh production database. Setting BOOTSTRAP_EMAIL and
   BOOTSTRAP_PASSWORD in the dashboard creates that account on the next boot;
   everyone else is invited from inside the portal after you sign in.

   Safe to leave set: it never touches an account that already exists, so a
   redeploy cannot reset a password or re-grant a role you have since changed. */
export async function bootstrapFounder() {
  const { email, password, name } = config.bootstrap;

  /* A database with no users at all is a dead deployment — nobody can log in,
     and every account-creating endpoint needs a Founder token. Say so loudly
     rather than starting up looking healthy. */
  if (!email || !password) {
    const { n } = await one('SELECT COUNT(*)::int AS n FROM users');
    if (n === 0) {
      console.warn(
        [
          '',
          '[bootstrap] ─────────────────────────────────────────────────────',
          '[bootstrap] There are NO accounts and nobody can sign in.',
          '[bootstrap] Set BOOTSTRAP_EMAIL and BOOTSTRAP_PASSWORD in the',
          '[bootstrap] Render dashboard and redeploy to create the Founder.',
          '[bootstrap] ─────────────────────────────────────────────────────',
          '',
        ].join('\n')
      );
    }
    return;
  }

  const existing = await one('SELECT id, role FROM users WHERE lower(email) = lower($1)', [email]);
  if (existing) {
    console.log(`[bootstrap] ${email} already exists (role: ${existing.role}) — leaving it alone`);
    return;
  }

  if (password.length < 12) {
    console.error('[bootstrap] BOOTSTRAP_PASSWORD must be at least 12 characters. Skipping.');
    return;
  }

  const id = newId('u');
  await query(
    `INSERT INTO users (id, name, email, username, password_hash, role, kyc_status)
     VALUES ($1, $2, lower($3), $4, $5, 'founder', 'verified')`,
    [id, name || 'Founder', email, email.split('@')[0].toLowerCase(), await hashPassword(password)]
  );
  await recordAudit(`Founder account ${email} created by bootstrap`, id, 'user', id);

  console.log(
    [
      `[bootstrap] created the first Founder: ${email}`,
      '[bootstrap] This is the only account on the system. Sign in, change the',
      '[bootstrap] password, clear BOOTSTRAP_PASSWORD, then create your Core',
      '[bootstrap] team from inside the portal.',
    ].join('\n')
  );
}
