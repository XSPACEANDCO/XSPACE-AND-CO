import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler, requireAuth } from './middleware.js';
import { MODULES, ROLES } from './rbac.js';

import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import leadRoutes from './routes/leads.js';
import listingRoutes from './routes/listings.js';
import projectRoutes from './routes/projects.js';
import visitRoutes from './routes/visits.js';
import verificationRoutes from './routes/verifications.js';
import mediaRoutes from './routes/media.js';
import userRoutes from './routes/users.js';
import fileRoutes, { publicFileRouter } from './routes/files.js';
import searchRoutes from './routes/search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // Render terminates TLS at its proxy
  app.use(
    helmet({
      /* The SPA is served from this same origin and Vite inlines a small
         amount of style; relax only what that needs. */
      contentSecurityPolicy: config.staticDir ? false : undefined,
      crossOriginEmbedderPolicy: false,
    })
  );

  if (config.corsOrigins.length) {
    app.use(cors({ origin: config.corsOrigins, credentials: true }));
  }

  /* Photos and documents arrive as base64 inside the JSON body, which
     inflates them by about a third — an 8 MB file needs roughly 11 MB of
     room. The upload routes enforce the real per-file caps; this only has to
     sit above them. */
  app.use(express.json({ limit: '12mb' }));

  /* Render pings this to decide whether the instance is healthy. */
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, env: config.env, time: new Date().toISOString() });
  });

  /* The access matrix, readable without a token, so the frontend can render
     its nav from the same source the server enforces. */
  app.get('/api/meta/access', (req, res) => {
    res.json({ roles: ROLES, modules: MODULES });
  });

  app.use('/api/auth', authRoutes);

  /* Reading an uploaded file is authorised by the unguessable key in its URL
     rather than by a header, because <img>, <video> and <a href> cannot send
     one. It therefore has to be mounted before the token gate. Uploading is
     a different route and does need a token — see routes/files.js. */
  app.use('/api/files', publicFileRouter);

  /* Everything past here needs a valid token. */
  app.use('/api', requireAuth);

  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/leads', leadRoutes);
  app.use('/api/listings', listingRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/visits', visitRoutes);
  app.use('/api/verifications', verificationRoutes);
  app.use('/api/media', mediaRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/search', searchRoutes);

  app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route' }));

  /* Serve the built frontend from the same service, so Render only needs one
     instance and the browser never makes a cross-origin call. */
  if (config.staticDir) {
    const dist = path.resolve(__dirname, '..', config.staticDir);
    app.use(express.static(dist));
    /* Client-side routing: anything that isn't a file or an API call is the SPA. */
    app.get(/.*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
