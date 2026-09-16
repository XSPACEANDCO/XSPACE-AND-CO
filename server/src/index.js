import { createApp } from './app.js';
import { config } from './config.js';
import { migrate, pool } from './db.js';
import { bootstrapFounder } from './bootstrap.js';

async function main() {
  await migrate();

  /* No demo data is generated, in any environment. The portal starts empty
     and fills up with what people actually enter. */

  /* First Founder for a fresh production database. No-op unless
     BOOTSTRAP_EMAIL and BOOTSTRAP_PASSWORD are set. */
  await bootstrapFounder();

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[server] listening on :${config.port} (${config.env})`);
  });

  /* Render sends SIGTERM before replacing an instance; finish in-flight
     requests and close the pool rather than dropping connections. */
  const shutdown = (signal) => async () => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown('SIGTERM'));
  process.on('SIGINT', shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[server] failed to start', err);
  process.exit(1);
});
