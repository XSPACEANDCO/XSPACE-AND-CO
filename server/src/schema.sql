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

-- Presence was a column nobody ever wrote to, so everyone read as "online"
-- forever. It is now derived from this timestamp, which requireAuth touches
-- as you use the portal: online < 5 min, away < 30 min, offline after that.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

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

-- The listing detail sheet asks for far more than the six columns above. These
-- are the rest of it, grouped the way the screen groups them. All nullable:
-- a realtor submitting inventory from site may only know half of it, and the
-- missing half gets filled in during verification.

-- Project snapshot. property_type / configuration use the same vocabulary as
-- a lead's requirement (src/leadStatus.js), so "3 BHK in Tellapur" means the
-- same thing whether it is being asked for or offered.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS builder        TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS property_type  TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS configuration  TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS possession     TEXT;

-- Unit details.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS super_built_up TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS carpet_area    TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS uds            TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS facing         TEXT;

-- Price & commercials. `price` above stays the headline figure shown in lists.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS base_price     TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS all_inclusive  TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS negotiation    TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS commission     TEXT;

-- Legal & verification. These are what Core actually checks against the
-- government portals before flipping `verified`.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS rera_number    TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS approval       TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS title_status   TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS bank_approved  TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS survey_number  TEXT;

-- Amenities: a newline-separated list, kept as text so a realtor can type one
-- this portal has never heard of rather than being limited to a fixed set.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS amenities      TEXT;

-- Media & documents. Files themselves live wherever they are hosted; the
-- listing stores the link.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS video_link     TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS brochure_url   TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS floor_plan_url TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS price_sheet_url TEXT;

ALTER TABLE listings ADD COLUMN IF NOT EXISTS high_demand    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS notes          TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS verified_at    TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS verified_by    TEXT REFERENCES users(id) ON DELETE SET NULL;

-- Photos attached to a listing.
--
-- The image is held as a base64 data URL in a text column rather than on disk.
-- Render's filesystem is wiped on every deploy, so anything written there
-- would vanish the next time the site updates; the database is the only
-- storage this deployment actually keeps. The client downscales before
-- uploading and the route enforces a size cap, so rows stay small.
CREATE TABLE IF NOT EXISTS listing_photos (
  id           TEXT PRIMARY KEY,
  listing_id   TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  data_url     TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  caption      TEXT,
  bytes        INTEGER NOT NULL DEFAULT 0,
  uploaded_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listing_photos_listing_idx ON listing_photos (listing_id);

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

-- Requirement snapshot. A flat is counted in bedrooms, land in acres and a
-- shop in square feet, so "configuration" holds whichever unit the chosen
-- property type calls for (see src/leadStatus.js).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_type  TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS configuration  TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS preferred_area TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS timeline       TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes          TEXT;

-- One pipeline, not three. Rows seeded under the old funnel vocabulary are
-- mapped onto the canonical statuses so existing leads keep their place.
UPDATE leads SET status = 'New'             WHERE status = 'Discovery';
UPDATE leads SET status = 'Contacted'       WHERE status = 'Engaged';
UPDATE leads SET status = 'Visit Scheduled' WHERE status = 'Site Visit';
UPDATE leads SET status = 'Negotiation'     WHERE status = 'Decision';

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

-- The editing round trip.
--
-- Raw media arrives from a creator or realtor, Studio claims and edits it,
-- and then re-uploads the finished cut. That finished cut is a second file,
-- not a replacement: the original has to survive so the work can be redone if
-- the edit is rejected. Founder and Core then either approve it or send it
-- back with notes, which is what these columns record.
ALTER TABLE media ADD COLUMN IF NOT EXISTS edited_url    TEXT;
ALTER TABLE media ADD COLUMN IF NOT EXISTS edited_at     TIMESTAMPTZ;
ALTER TABLE media ADD COLUMN IF NOT EXISTS edited_by     TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE media ADD COLUMN IF NOT EXISTS review_notes  TEXT;
ALTER TABLE media ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ;
ALTER TABLE media ADD COLUMN IF NOT EXISTS reviewed_by   TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE media ADD COLUMN IF NOT EXISTS revision      INTEGER NOT NULL DEFAULT 0;

-- 'delivered' now means "edited and waiting on review" rather than "finished",
-- so two more states are needed at the end of the pipeline. The original CHECK
-- constraint predates them and would reject both.
ALTER TABLE media DROP CONSTRAINT IF EXISTS media_status_check;
ALTER TABLE media ADD CONSTRAINT media_status_check CHECK (
  status IN ('pending','in_progress','delivered','approved','changes_requested','rejected')
);

-- Uploaded files: brochures, floor plans, price sheets, raw and edited media.
--
-- Same reasoning as listing_photos — Render wipes the filesystem on every
-- deploy, so the database is the only storage that survives. Held as base64
-- text rather than bytea because the local PGlite store and hosted Postgres
-- disagree about how binary round-trips, and text behaves identically on both.
--
-- access_key is a capability: a long random string that makes the URL
-- unguessable. It exists because a browser fetching <a href> or <video src>
-- cannot attach an Authorization header, so the link itself has to carry the
-- right to read the file. Knowing a file's id is not enough without it.
CREATE TABLE IF NOT EXISTS uploads (
  id           TEXT PRIMARY KEY,
  access_key   TEXT NOT NULL,
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL,
  data         TEXT NOT NULL,
  bytes        INTEGER NOT NULL DEFAULT 0,
  uploaded_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS uploads_uploaded_by_idx ON uploads (uploaded_by);

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
