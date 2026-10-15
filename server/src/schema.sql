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
  status IN ('pending','in_progress','qc','delivered','approved','changes_requested','rejected')
);

-- What the partner dashboards need to answer "what is due, what is stuck, and
-- did it work":
--   due_at / priority  when Studio owes the finished cut, and how urgent it is
--   blocked_on         what the item is waiting for (raw_media, property_info,
--                      creator_feedback) — NULL when nothing is blocking it
--   views              reach of the published piece, entered by its creator
-- 'qc' (above) is Studio's own quality check, between editing and handing the
-- cut to Founder/Core for approval.
ALTER TABLE media ADD COLUMN IF NOT EXISTS due_at     TIMESTAMPTZ;
ALTER TABLE media ADD COLUMN IF NOT EXISTS priority   TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE media ADD COLUMN IF NOT EXISTS blocked_on TEXT;
ALTER TABLE media ADD COLUMN IF NOT EXISTS views      INTEGER;

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

-- A lead can name the piece of content that produced it, which is how a
-- creator's dashboard proves their reels generate business. follow_up_at is
-- the realtor's next promised call, which drives the follow-up summary.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_media_id TEXT REFERENCES media(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_at    TIMESTAMPTZ;

-- "Apartment" was retired from the property types in favour of the market's
-- own split (standalone / semi-gated / gated / gated high-rise). A plain
-- apartment is a standalone building unless somebody says otherwise.
UPDATE leads    SET property_type = 'standalone' WHERE property_type = 'apartment';
UPDATE listings SET property_type = 'standalone' WHERE property_type = 'apartment';

-- Escalation notices used to quote the verification's internal id
-- ("Verification vf_3a9c… escalated to legal"). Rewrite the ones already
-- sent so they name the property, as new ones now do.
UPDATE notifications n
   SET title = 'Verification of "' || COALESCE(l.title, p.name) || '" escalated to legal'
  FROM verifications v
  LEFT JOIN listings l ON l.id = v.listing_id
  LEFT JOIN projects p ON p.id = v.project_id
 WHERE n.title = 'Verification ' || v.id || ' escalated to legal'
   AND COALESCE(l.title, p.name) IS NOT NULL;

-- Land is sold on different facts from a flat — extent, zoning, conversion,
-- road access, the pattadar and the passbook — so a listing whose
-- property_type is 'land' fills these in instead of the unit fields above.
-- survey_number, approval, title_status, price and the document links are
-- shared with every other listing.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS land_kind       TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS extent          TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS price_basis     TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS village         TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS mandal          TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS district        TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS zoning          TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS conversion      TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS road_access     TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS frontage        TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS boundaries      TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS utilities       TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS landmarks       TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS pattadar        TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS passbook        TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS ec_status       TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS litigation      TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS layout_plan_url TEXT;

-- Partner KYC and payout details. Aadhaar is kept as its last four digits
-- only: the scanned card is the evidence, and the full number is not
-- something this portal should be holding. kyc_note carries the reason when
-- a submission is sent back.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pan_number       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_last4    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rera_agent_no    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pan_doc_url      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_doc_url  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_holder      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_account     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_ifsc        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_name        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS upi_id           TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_note         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_reviewed_at  TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_reviewed_by  TEXT REFERENCES users(id) ON DELETE SET NULL;

-- When the partner last confirmed they have read the rules for their role.
ALTER TABLE users ADD COLUMN IF NOT EXISTS rules_ack_at     TIMESTAMPTZ;

-- Area updates are sorted by what kind of news they are, and may point at a
-- source (a builder's announcement, a news story, a GO).
ALTER TABLE area_updates ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'market';
ALTER TABLE area_updates ADD COLUMN IF NOT EXISTS link     TEXT;

-- Bumped whenever a password is changed or reset. A login token carries the
-- version it was issued under and stops working once this moves on, so a
-- reset actually locks out whoever had the old password instead of leaving
-- their session alive for up to the token's 12 hours.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- Role-wide notifications are read per person. `notifications.read` only
-- covers ones addressed to a single user; marking a broadcast read used to
-- flip that shared flag and hide it from everyone else in the role.
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

-- Commercial and industrial carry a sub-type (office space / shops; open
-- plot / godown / industry). Same vocabulary on a listing and a lead's
-- requirement — see src/leadStatus.js.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS property_subtype TEXT;
ALTER TABLE leads    ADD COLUMN IF NOT EXISTS property_subtype TEXT;

-- ---------------------------------------------------------------------------
-- Member lifecycle and email automations (src/automations.js).
--
--   approved -> account created -> welcome + portal access emails
--   -> first login (member is Active) -> onboarding -> role workflow
--
-- Onboarding is done when KYC is verified and the role's rules have been
-- acknowledged. Until then the member is reminded twice, then Core is asked
-- to follow up by hand; these columns record how far that has gone.
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login_at          TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_reminders    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_reminded_at  TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_escalated_at TIMESTAMPTZ;

-- Accounts that already signed in and finished onboarding before this existed
-- should not be reminded about it now.
UPDATE users SET first_login_at = COALESCE(first_login_at, last_seen_at, created_at)
 WHERE first_login_at IS NULL AND last_seen_at IS NOT NULL;
UPDATE users SET onboarding_completed_at = COALESCE(kyc_reviewed_at, rules_ack_at, now())
 WHERE onboarding_completed_at IS NULL
   AND (role IN ('founder','core') OR (kyc_status = 'verified' AND rules_ack_at IS NOT NULL));

-- Listing review can now send a listing back to its realtor rather than only
-- verifying it. corrections_note is what they are asked to fix; it is cleared
-- when they resubmit.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS corrections_note TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS corrections_at   TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS resubmitted_at   TIMESTAMPTZ;

ALTER TABLE verifications DROP CONSTRAINT IF EXISTS verifications_status_check;
ALTER TABLE verifications ADD CONSTRAINT verifications_status_check CHECK (
  status IN ('pending','inprogress','escalated','corrections','verified','rejected')
);

-- Founder/Core can hand a content brief to a creator (it becomes theirs, as
-- if they had uploaded it) or a production task to a Studio member.
-- assigned_by records who asked.
ALTER TABLE media ADD COLUMN IF NOT EXISTS assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL;

-- Every automated email, sent or not. dedupe_key makes each automation
-- idempotent: a reminder for one visit at one time, or one week's summary,
-- is only ever sent once however often the scheduler runs.
CREATE TABLE IF NOT EXISTS email_log (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  to_email   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('sent','logged','failed')),
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_log_dedupe_key ON email_log (dedupe_key);
CREATE INDEX IF NOT EXISTS email_log_created_idx ON email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS email_log_user_idx ON email_log (user_id);

-- A client's email, optional. When present the client is emailed about their
-- site visits (CL-01..04); without it they are not contacted by email at all.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT;

-- Staff and partners are told about every lifecycle step in the app, never by
-- email (only clients are emailed). The scheduled ones — reminders, deadlines,
-- summaries, the daily digest — claim a key here first so each is only ever
-- posted once however often the scheduler runs.
CREATE TABLE IF NOT EXISTS automation_runs (
  dedupe_key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Client journey (src/clientJourney.js, routes/journey.js, routes/public.js).
--
--   outreach -> appointment -> requirements -> shortlist -> site visit
--   -> follow-up -> deal -> handover -> feedback -> referral
--
-- Xspace owns the client relationship; these are Founder/Core actions, and
-- each step emails the client (CL-01..13) when the lead has an address and
-- has not unsubscribed.

-- Cold outreach: CL-01, then CL-02 and CL-03 if they do not respond, then
-- out of the active sequence. 'responded' stops it.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS outreach_status  TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS outreach_step    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS outreach_last_at TIMESTAMPTZ;

-- Requirement: what the property is for (own use, investment, rental...).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS purpose TEXT;

-- Deal and handover are separate events.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS closed_at               TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS handover_at             TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS handover_location       TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS handover_instructions   TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS handover_completed_at   TIMESTAMPTZ;

-- The client asked to stop receiving email. Every automated email checks it.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_opt_out_at TIMESTAMPTZ;

-- A lead that came from another client's referral (CL-13).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referred_by TEXT REFERENCES leads(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS appointments (
  id           TEXT PRIMARY KEY,
  lead_id      TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  mode         TEXT NOT NULL DEFAULT 'in_person' CHECK (mode IN ('in_person','online','phone')),
  location     TEXT,
  meeting_link TEXT,
  purpose      TEXT,
  status       TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appointments_lead_idx ON appointments (lead_id);

-- Projects Xspace has picked for a client. Only verified listings can be
-- shortlisted. sent_at is when it went out in CL-06; interested_at is when
-- the client tapped "I'm interested" on their shortlist page.
CREATE TABLE IF NOT EXISTS lead_shortlist (
  id            TEXT PRIMARY KEY,
  lead_id       TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  listing_id    TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  note          TEXT,
  added_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at       TIMESTAMPTZ,
  interested_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS lead_shortlist_unique ON lead_shortlist (lead_id, listing_id);

-- Site visit details the client needs, and their answer to CL-09.
ALTER TABLE visits ADD COLUMN IF NOT EXISTS meeting_point   TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS map_link        TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS rep_id          TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS client_response TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS client_responded_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS client_feedback (
  id              TEXT PRIMARY KEY,
  lead_id         TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  communication   INTEGER CHECK (communication BETWEEN 1 AND 5),
  recommendations INTEGER CHECK (recommendations BETWEEN 1 AND 5),
  presentation    INTEGER CHECK (presentation BETWEEN 1 AND 5),
  site_visit      INTEGER CHECK (site_visit BETWEEN 1 AND 5),
  overall         INTEGER NOT NULL CHECK (overall BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS client_feedback_lead ON client_feedback (lead_id);

-- Links in client emails. The client has no login, so the unguessable token
-- in the link is what lets them see their shortlist or answer a question —
-- the same capability idea as uploads.access_key. kind decides what it opens.
CREATE TABLE IF NOT EXISTS client_links (
  token      TEXT PRIMARY KEY,
  lead_id    TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('shortlist','visit','feedback','referral','unsubscribe')),
  ref_id     TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_links_lead_idx ON client_links (lead_id, kind);

-- Which client an email went to, for the client's email history.
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS email_log_lead_idx ON email_log (lead_id);
