import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(
      `[config] Missing required environment variable ${name}.\n` +
        `         Copy server/.env.example to server/.env for local work, or set it\n` +
        `         in the Render dashboard for a deployed service.`
    );
    process.exit(1);
  }
  return v;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 10000,

  /* Where the data lives.
     A `file:` URL (the default) keeps it in a folder on this machine, run
     by an embedded Postgres — nothing to install, and accounts created
     while testing survive a restart. A postgres:// URL uses a real server,
     which is what Render supplies. See src/db.js. */
  databaseUrl: process.env.DATABASE_URL || 'file:./.data/xspace',
  jwtSecret:
    process.env.JWT_SECRET ||
    ((process.env.NODE_ENV || 'development') === 'production'
      ? required('JWT_SECRET')
      : 'local-development-secret-not-for-production-use-only'),
  tokenTtl: process.env.TOKEN_TTL || '12h',

  /* Same-origin by default: the server hands out the built frontend, so the
     browser never makes a cross-origin call. Only needed if you split the
     frontend onto its own host. */
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  staticDir:
    process.env.STATIC_DIR === ''
      ? null
      : process.env.STATIC_DIR || '../xspace-portal-react/dist',



  /* Login throttling, per 15-minute window. See routes/auth.js — the per
     account limit is the brute-force brake, the per-IP one is the sweep
     brake, and the IP one is deliberately loose because partners share
     office and mobile NAT addresses. */
  loginAttemptsPerAccount: Number(process.env.LOGIN_ATTEMPTS_PER_ACCOUNT) || 10,
  loginAttemptsPerIp: Number(process.env.LOGIN_ATTEMPTS_PER_IP) || 100,

  /* Founder + Core are meant to be a fixed set of roughly ten people. A
     guardrail against a mistake or a stolen Founder token, not a business
     rule — raise it if the team actually grows. */
  maxInternalAccounts: Number(process.env.MAX_INTERNAL_ACCOUNTS) || 10,


  /* Automated member emails. See src/mailer.js and src/automations.js.

     With no RESEND_API_KEY nothing leaves the server: every email is still
     written to the email log (Teams -> Email log) marked "logged", so the
     automations can be tested without mailing real people. */
  email: {
    resendApiKey: process.env.RESEND_API_KEY || '',
    from: process.env.EMAIL_FROM || 'Xspace <onboarding@resend.dev>',
    replyTo: process.env.EMAIL_REPLY_TO || '',
    /* The address in every email's "open the portal" link. */
    portalUrl: (process.env.PORTAL_URL || 'http://localhost:10000').replace(/\/+$/, ''),
  },

  automations: {
    /* Off switch for the in-process scheduler (reminders and summaries). The
       event emails — welcome, approvals and so on — are unaffected. */
    enabled: process.env.AUTOMATIONS_ENABLED !== 'false',
    /* Days between onboarding reminder 1, reminder 2 and the Core follow-up. */
    onboardingReminderDays: Number(process.env.ONBOARDING_REMINDER_DAYS) || 2,
    /* Lets an external cron call POST /api/automations/tick. Render's free
       tier sleeps when idle and the in-process timer sleeps with it. */
    cronSecret: process.env.CRON_SECRET || '',
  },

  /* First Founder for a fresh database. See src/bootstrap.js. */
  bootstrap: {
    email: process.env.BOOTSTRAP_EMAIL || '',
    password: process.env.BOOTSTRAP_PASSWORD || '',
    name: process.env.BOOTSTRAP_NAME || '',
  },
};

/* The file store lives on the instance's own disk. On Render that disk is
   replaced on every deploy, so shipping it to production would quietly lose
   every account. Fail instead of losing data later. */
if (config.env === 'production' && /^file:/.test(config.databaseUrl)) {
  console.error(
    [
      '[config] DATABASE_URL is a file store, which is wiped on every deploy.',
      '         Set DATABASE_URL to the Internal Database URL of a Postgres',
      '         instance before running in production.',
    ].join('\n')
  );
  process.exit(1);
}

/* A weak secret in production is worth failing over, not warning about. */
if (config.env === 'production' && config.jwtSecret.length < 32) {
  console.error('[config] JWT_SECRET must be at least 32 characters in production.');
  process.exit(1);
}
