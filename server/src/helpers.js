import { randomUUID } from 'node:crypto';
import { one, query } from './db.js';

/* Short, readable, collision-free enough for this scale. */
export function newId(prefix = 'x') {
  return `${prefix}_${randomUUID().slice(0, 12)}`;
}

export async function recordAudit(text, actorId, entity = null, entityId = null) {
  await query(
    'INSERT INTO audit_log (id, text, actor_id, entity, entity_id) VALUES ($1,$2,$3,$4,$5)',
    [newId('ad'), text, actorId, entity, entityId]
  );
}

export async function recordActivity(text, actorId) {
  await query('INSERT INTO activity (id, text, actor_id) VALUES ($1,$2,$3)', [
    newId('a'),
    text,
    actorId,
  ]);
}

/* Target either one user (userId) or every holder of a role. */
export async function notify({ userId = null, role = null, type = 'info', title, body = null }) {
  await query(
    'INSERT INTO notifications (id, user_id, role, type, title, body) VALUES ($1,$2,$3,$4,$5,$6)',
    [newId('n'), userId, role, type, title, body]
  );
}

/* A link stored on a record and later rendered as <a href> / <img src>.

   Only web links and the portal's own uploads (/api/files/…) are accepted.
   Anything else — javascript:, data:, file: — is refused here rather than
   trusted to be harmless when somebody clicks it. Empty means "no link".
   Returns the cleaned URL, null for empty, or undefined when it is unsafe. */
export function safeUrl(value) {
  if (value === undefined || value === null) return null;
  const v = String(value).trim();
  if (v === '') return null;
  if (/^\/api\/files\/[\w-]+\/[a-f0-9]+$/i.test(v)) return v;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? v : undefined;
  } catch {
    return undefined;
  }
}

/* A date from a request body, or null. Anything unparseable is null rather
   than a 500 from Postgres. */
export function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* Mark a listing verified and publish it to Projects.

   Both the listing sheet's "Mark verified" and the Verification Queue's
   "Mark Verified" end here. They used to do different things: the queue
   only flipped `verified`, so the listing left the Listings queue but never
   reached Projects and its submitter was never told. */
export async function publishVerifiedListing(listingId, actorId) {
  let listing = await one(
    `UPDATE listings SET verified = TRUE, verified_at = COALESCE(verified_at, now()),
            verified_by = COALESCE(verified_by, $2), corrections_note = NULL
      WHERE id = $1 RETURNING *`,
    [listingId, actorId]
  );
  if (!listing) return null;

  /* A listing submitted against an existing project just joins it; a
     standalone one gets a project of its own, carrying over what was checked. */
  if (!listing.project_id) {
    const project = await one(
      `INSERT INTO projects (id, name, builder, rera, status, units, possession, brochure_url)
       VALUES ($1,$2,$3,$4,'Verified',1,$5,$6) RETURNING *`,
      [
        newId('p'), listing.title, listing.builder || null, listing.rera_number || null,
        listing.possession || null, listing.brochure_url || null,
      ]
    );
    listing = await one('UPDATE listings SET project_id = $2 WHERE id = $1 RETURNING *', [
      listing.id,
      project.id,
    ]);
    await recordAudit(`Project ${project.name} created from verified listing`, actorId, 'project', project.id);
  }

  await one(
    `UPDATE verifications SET status='verified', finished_at=now(),
            started_at = COALESCE(started_at, now()), assigned_to=$2
      WHERE listing_id=$1 AND status <> 'verified' RETURNING id`,
    [listing.id, actorId]
  );
  await recordAudit(`Listing ${listing.title} verified`, actorId, 'listing', listing.id);
  if (listing.submitted_by) {
    await notify({
      userId: listing.submitted_by,
      type: 'verification',
      title: `Your listing "${listing.title}" was verified`,
    });
  }
  return listing;
}

/* Send a listing back to its realtor with what needs fixing.

   The listing stays unverified and in the queue; its verification row moves
   to 'corrections' so the queue shows it is waiting on the realtor rather
   than on Core. Editing the listing resubmits it (resubmitListing). */
export async function requestListingCorrections(listingId, notes, actorId) {
  const listing = await one(
    `UPDATE listings SET corrections_note = $2, corrections_at = now()
      WHERE id = $1 AND verified = FALSE RETURNING *`,
    [listingId, notes]
  );
  if (!listing) return null;

  await query(
    `UPDATE verifications SET status = 'corrections', notes = $2, assigned_to = $3,
            started_at = COALESCE(started_at, now())
      WHERE listing_id = $1 AND status <> 'verified'`,
    [listing.id, notes, actorId]
  );
  if (listing.submitted_by) {
    await notify({
      userId: listing.submitted_by,
      type: 'verification',
      title: `Corrections needed on "${listing.title}"`,
      body: notes,
    });
  }
  await recordAudit(`Listing ${listing.title} sent back for corrections`, actorId, 'listing', listing.id);
  return listing;
}

/* The realtor saved a listing that was waiting on their corrections: it goes
   back into the verification queue as a fresh submission. */
export async function resubmitListing(listingId, actorId) {
  const listing = await one(
    `UPDATE listings SET corrections_note = NULL, resubmitted_at = now()
      WHERE id = $1 AND corrections_note IS NOT NULL RETURNING *`,
    [listingId]
  );
  if (!listing) return null;

  await query(
    `UPDATE verifications SET status = 'pending', notes = 'Resubmitted after corrections'
      WHERE listing_id = $1 AND status = 'corrections'`,
    [listing.id]
  );
  await notify({ role: 'core', type: 'verification', title: `Listing resubmitted: ${listing.title}` });
  await recordAudit(`Listing ${listing.title} resubmitted after corrections`, actorId, 'listing', listing.id);
  return listing;
}
