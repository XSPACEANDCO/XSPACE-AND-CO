import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.join(__dirname, '..');

/* Two stores behind one interface.

   file:  PGlite — real Postgres compiled to WASM, keeping its data in a folder
          on this machine. No server to install or start, and the accounts you
          create survive a restart. This is the local testing store.

   postgres:  a normal connection pool, which is what Render uses.

   Same SQL either way, so nothing above this file knows which one is running
   and local behaviour matches production. */
const fileStore = /^file:/.test(config.databaseUrl);

/* Where a file store keeps its data. Relative paths resolve against server/,
   not the shell's working directory, so `npm start` from anywhere finds it. */
export const dataDir = fileStore
  ? path.resolve(SERVER_ROOT, config.databaseUrl.replace(/^file:(\/\/)?/, ''))
  : null;

/* Whether to negotiate TLS.

   Decided from the connection string rather than NODE_ENV: a production
   deployment against a database on a private network or a local socket has no
   TLS to negotiate, and forcing it there fails to connect. Managed providers
   (Render, Neon, Supabase, RDS) all terminate TLS with a CA this pool has no
   root for, hence rejectUnauthorized:false — it encrypts the link but does not
   authenticate the server. Set DATABASE_SSL explicitly to override. */
function sslSetting(url) {
  if (process.env.DATABASE_SSL === 'false') return false;
  if (process.env.DATABASE_SSL === 'true') return { rejectUnauthorized: false };
  if (/[?&]sslmode=disable/.test(url)) return false;

  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    /* non-URL connection strings (e.g. a socket path) — assume no TLS */
    return false;
  }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '';
  return isLocal ? false : { rejectUnauthorized: false };
}

/* Created on first use so importing this module never touches the disk — the
   RBAC drift check and the tests import routes without wanting a database. */
let store = null;

async function getStore() {
  if (store) return store;

  if (fileStore) {
    /* Imported lazily: a Render deployment uses the pg pool and should not pay
       to load a WASM Postgres it will never run. */
    const { PGlite } = await import('@electric-sql/pglite');
    /* PGlite creates its own folder but not the parents above it. */
    await fs.mkdir(path.dirname(dataDir), { recursive: true });
    const pglite = await PGlite.create({ dataDir });
    console.log(`[db] file store at ${dataDir}`);
    store = {
      kind: 'file',
      query: (text, params) => pglite.query(text, params),
      /* PGlite runs one statement per query; scripts go through exec. */
      script: (sql) => pglite.exec(sql),
      transaction: (fn) => pglite.transaction((tx) => fn(tx)),
      end: () => pglite.close(),
    };
    return store;
  }

  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: sslSetting(config.databaseUrl),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (err) => console.error('[db] idle client error', err.message));

  store = {
    kind: 'postgres',
    query: (text, params) => pool.query(text, params),
    script: (sql) => pool.query(sql),
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  };
  return store;
}

export async function query(text, params) {
  return (await getStore()).query(text, params);
}

/* Returns the first row, or null. */
export async function one(text, params) {
  const { rows } = await query(text, params);
  return rows[0] ?? null;
}

export async function many(text, params) {
  const { rows } = await query(text, params);
  return rows;
}

/* Runs fn inside a transaction, rolling back on throw. */
export async function transaction(fn) {
  return (await getStore()).transaction(fn);
}

/* Kept for the shutdown path in index.js, which used to close the pg pool
   directly. Either store closes the same way. */
export const pool = {
  end: async () => {
    if (store) await store.end();
  },
};

/* schema.sql is written to be idempotent (CREATE TABLE IF NOT EXISTS), so it
   runs on every boot and doubles as the migration step. */
export async function migrate() {
  const s = await getStore();
  const sql = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  await s.script(sql);
  console.log(`[db] schema up to date (${s.kind} store)`);
}

export async function describeStore() {
  const s = await getStore();
  return s.kind === 'file' ? `file store — ${dataDir}` : 'postgres server';
}
