-- Xspace Portal schema. Idempotent: runs on every boot as the migration step.

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('founder','core','realtor','creator','studio')),
  phone           TEXT,
  presence        TEXT NOT NULL DEFAULT 'online',
  areas           TEXT,           -- realtor: areas covered
  platform        TEXT,           -- creator: instagram / youtube
  handle          TEXT,           -- creator: @handle
  skill           TEXT,           -- studio: camera / VR / editor
  kyc_status      TEXT NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending','verified','rejected')),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by TEXT;

-- Partners sign in with a username rather than an email address, so every
-- account has one. Login accepts either (routes/auth.js).
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;

-- Accounts that predate the column get one from the local part of their email.
-- The window function suffixes duplicates, so this cannot collide with itself
-- and break the unique index created below.
WITH candidates AS (
  SELECT id,
         lower(split_part(email, '@', 1)) AS base,
         row_number() OVER (
           PARTITION BY lower(split_part(email, '@', 1)) ORDER BY created_at, id
         ) AS n
    FROM users
   WHERE username IS NULL
)
UPDATE users u
   SET username = CASE WHEN c.n = 1 THEN c.base ELSE c.base || c.n::text END
  FROM candidates c
 WHERE u.id = c.id;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (lower(username));

-- Passwords used to have to be replaced on first login. They no longer do: the
-- Founder issues one and the person keeps it until somebody resets it.
ALTER TABLE users DROP COLUMN IF EXISTS must_change_password;

CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  builder      TEXT,
  rera         TEXT,
  status       TEXT NOT NULL DEFAULT 'Draft',
  units        INTEGER NOT NULL DEFAULT 0,
  possession   TEXT,
  brochure_url TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listings (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  area         TEXT,
  price        TEXT,
  unit_type    TEXT,
  status       TEXT NOT NULL DEFAULT 'Available',
  verified     BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_to  TEXT REFERENCES users(id) ON DELETE SET NULL,
  submitted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listings_assigned_idx ON listings (assigned_to);

CREATE TABLE IF NOT EXISTS leads (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  phone                TEXT,
  source               TEXT,
  budget               TEXT,
  status               TEXT NOT NULL DEFAULT 'Discovery',
  temperature          TEXT NOT NULL DEFAULT 'warm' CHECK (temperature IN ('hot','warm','cold')),
  assigned_to          TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by           TEXT REFERENCES users(id) ON DELETE SET NULL,
  listing_id           TEXT REFERENCES listings(id) ON DELETE SET NULL,
  last_interaction_at  TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_assigned_idx ON leads (assigned_to);
CREATE INDEX IF NOT EXISTS leads_created_by_idx ON leads (created_by);

CREATE TABLE IF NOT EXISTS visits (
  id                    TEXT PRIMARY KEY,
  lead_id               TEXT REFERENCES leads(id) ON DELETE CASCADE,
  listing_id            TEXT REFERENCES listings(id) ON DELETE SET NULL,
  assigned_to           TEXT REFERENCES users(id) ON DELETE SET NULL,
  scheduled_at          TIMESTAMPTZ,
  ended_at              TIMESTAMPTZ,
  feedback_submitted_at TIMESTAMPTZ,
  feedback              TEXT,
  mode                  TEXT NOT NULL DEFAULT 'On-site',
  status                TEXT NOT NULL DEFAULT 'Scheduled'
                        CHECK (status IN ('Scheduled','Completed','Unsuccessful','Rescheduled')),
  reason                TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visits_assigned_idx ON visits (assigned_to);

CREATE TABLE IF NOT EXISTS verifications (
  id          TEXT PRIMARY KEY,
  listing_id  TEXT REFERENCES listings(id) ON DELETE CASCADE,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  type        TEXT NOT NULL DEFAULT 'Listing',
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','inprogress','escalated','verified','rejected')),
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes       TEXT,
  escalated   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tickets (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'other',
  priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  raised_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tickets_raised_by_idx ON tickets (raised_by);

CREATE TABLE IF NOT EXISTS commissions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deal_ref   TEXT,
  amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid')),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS commissions_user_idx ON commissions (user_id);

-- Raw reels / shorts from creators and realtors, and the finished library.
CREATE TABLE IF NOT EXISTS media (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'reel' CHECK (kind IN ('reel','video','short','photo','doc')),
  url         TEXT,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  claimed_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','in_progress','delivered','rejected')),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS media_uploaded_by_idx ON media (uploaded_by);
CREATE INDEX IF NOT EXISTS media_status_idx ON media (status);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT,          -- broadcast to a role when user_id is null
  type       TEXT NOT NULL DEFAULT 'info',
  title      TEXT NOT NULL,
  body       TEXT,
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_role_idx ON notifications (role);

CREATE TABLE IF NOT EXISTS activity (
  id         TEXT PRIMARY KEY,
  text       TEXT NOT NULL,
  actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only. Every state change a Founder would want to audit lands here.
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  text       TEXT NOT NULL,
  actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  entity     TEXT,
  entity_id  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log (created_at DESC);

CREATE TABLE IF NOT EXISTS area_updates (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area       TEXT NOT NULL,
  note       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
