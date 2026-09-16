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

  seedPassword: process.env.SEED_PASSWORD || 'xspace123',

  /* Demo data is for local work. In production it defaults OFF so a real
     deployment never ships five accounts with a shared password. */
  seedDemo:
    process.env.SEED_DEMO != null
      ? process.env.SEED_DEMO === 'true'
      : (process.env.NODE_ENV || 'development') !== 'production',

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
