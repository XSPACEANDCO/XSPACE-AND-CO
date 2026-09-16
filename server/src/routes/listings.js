import { Router } from 'express';
import { many, one } from '../db.js';
import { asyncHandler, requireModule, requirePermission } from '../middleware.js';
import { seesEverything } from '../rbac.js';
import { newId, notify, recordActivity, recordAudit } from '../helpers.js';
import { isValidPropertyType } from '../leadStatus.js';

const router = Router();

router.use(requireModule('listings'));

/* Every field the listing sheet collects, as camelCase-in / snake_case-out
   pairs. Keeping the list in one place means POST, PATCH and the column list
   can never drift apart the way they would with three hand-written SQL
   statements. */
const FIELDS = [
  ['title', 'title'],
  ['projectId', 'project_id'],
  ['area', 'area'],
  ['price', 'price'],
  ['unitType', 'unit_type'],
  ['status', 'status'],
  /* Project snapshot */
  ['builder', 'builder'],
  ['propertyType', 'property_type'],
  ['configuration', 'configuration'],
  ['possession', 'possession'],
  /* Unit details */
  ['superBuiltUp', 'super_built_up'],
  ['carpetArea', 'carpet_area'],
  ['uds', 'uds'],
  ['facing', 'facing'],
  /* Price & commercials */
  ['basePrice', 'base_price'],
  ['allInclusive', 'all_inclusive'],
  ['negotiation', 'negotiation'],
  ['commission', 'commission'],
  /* Legal & verification */
  ['reraNumber', 'rera_number'],
  ['approval', 'approval'],
  ['titleStatus', 'title_status'],
  ['bankApproved', 'bank_approved'],
  ['surveyNumber', 'survey_number'],
  /* Amenities, media, notes */
  ['amenities', 'amenities'],
  ['videoLink', 'video_link'],
  ['brochureUrl', 'brochure_url'],
  ['floorPlanUrl', 'floor_plan_url'],
  ['priceSheetUrl', 'price_sheet_url'],
  ['highDemand', 'high_demand'],
  ['notes', 'notes'],
];

/* Blank strings from an untouched form field are stored as NULL rather than
   as '', so "not filled in" reads the same everywhere. */
function clean(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

/* Realtor partners see only inventory they submitted or are assigned. */
function scopeClause(user, startIndex = 1) {
  if (seesEverything(user.role)) return { where: '', params: [] };
  return {
    where: ` AND (l.assigned_to = $${startIndex} OR l.submitted_by = $${startIndex})`,
    params: [user.id],
  };
}

/* Listings is the queue of inventory still waiting on verification. Once a
   listing is verified it belongs to Projects, so it leaves this list rather
   than sitting here with a green badge forever — that is what kept the page
   filling up with things nobody had to look at any more.

   ?include=verified returns them anyway, for anything that needs the full
   book rather than the queue. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { where, params } = scopeClause(req.user);
    const includeVerified = req.query.include === 'verified' || req.query.include === 'all';
    const verifiedClause = includeVerified ? '' : ' AND l.verified = FALSE';

    const rows = await many(
      `SELECT l.*, p.name AS project_name, p.builder AS project_builder,
              su.name AS submitted_by_name, au.name AS assigned_to_name
         FROM listings l
         LEFT JOIN projects p ON p.id = l.project_id
         LEFT JOIN users su ON su.id = l.submitted_by
         LEFT JOIN users au ON au.id = l.assigned_to
        WHERE 1=1 ${where}${verifiedClause}
        ORDER BY l.created_at DESC`,
      params
    );
    res.json({ listings: rows, canVerify: seesEverything(req.user.role) });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { where, params } = scopeClause(req.user, 2);
    /* l.* already carries the listing's own builder / possession, so the
       project's are aliased rather than silently overwriting them. */
    const listing = await one(
      `SELECT l.*, su.name AS submitted_by_name,
              p.name AS project_name, p.builder AS project_builder,
              p.rera AS project_rera, p.possession AS project_possession
         FROM listings l
         LEFT JOIN users su ON su.id = l.submitted_by
         LEFT JOIN projects p ON p.id = l.project_id
        WHERE l.id = $1 ${where}`,
      [req.params.id, ...params]
    );
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    const media = await many('SELECT * FROM media WHERE project_id = $1 ORDER BY created_at DESC', [
      listing.project_id,
    ]);
    res.json({ listing, media });
  })
);

router.post(
  '/',
  requirePermission('listings:write'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const title = clean(body.title);
    if (!title) return res.status(400).json({ error: 'title is required' });

    if (!isValidPropertyType(clean(body.propertyType) || undefined)) {
      return res.status(400).json({ error: 'Unknown property type' });
    }

    /* Build the insert from whichever fields were actually supplied, so a
       half-filled listing submitted from site is accepted and can be completed
       later rather than being rejected outright. */
    const cols = ['id', 'submitted_by', 'assigned_to'];
    const values = [newId('l'), req.user.id, req.user.id];
    for (const [key, column] of FIELDS) {
      const value = clean(body[key]);
      if (value === undefined) continue;
      cols.push(column);
      values.push(value);
    }
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');

    const listing = await one(
      `INSERT INTO listings (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    const id = listing.id;
    const projectId = listing.project_id;

    /* A new listing needs verifying before it can be shown to a client. */
    await one(
      `INSERT INTO verifications (id, listing_id, project_id, type, notes)
       VALUES ($1,$2,$3,'Listing',$4) RETURNING id`,
      [newId('vf'), id, projectId || null, 'Awaiting first pass']
    );
    await recordActivity(`${req.user.name} added listing ${title}`, req.user.id);
    await recordAudit(`Listing ${title} created`, req.user.id, 'listing', id);
    await notify({ role: 'core', type: 'verification', title: `New listing to verify: ${title}` });

    res.status(201).json({ listing });
  })
);

router.patch(
  '/:id',
  requirePermission('listings:write'),
  asyncHandler(async (req, res) => {
    const { where, params } = scopeClause(req.user, 2);
    const existing = await one(`SELECT l.* FROM listings l WHERE l.id = $1 ${where}`, [
      req.params.id,
      ...params,
    ]);
    if (!existing) return res.status(404).json({ error: 'Listing not found' });

    const body = req.body || {};
    if (!isValidPropertyType(clean(body.propertyType) || undefined)) {
      return res.status(400).json({ error: 'Unknown property type' });
    }

    /* Only the fields actually present in the request are touched. A field
       sent as "" is cleared; one left out keeps its value. COALESCE could not
       express that difference — it treats both as "leave alone". */
    const sets = [];
    const values = [req.params.id];
    for (const [key, column] of FIELDS) {
      if (!(key in body)) continue;
      const value = clean(body[key]);
      if (value === undefined) continue;
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    }
    if (sets.length === 0) return res.json({ listing: existing });

    /* `verified` is never settable here — that goes through :id/verify, which
       requires the listings:verify permission. */
    const listing = await one(
      `UPDATE listings SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    await recordAudit(`Listing ${listing.title} updated`, req.user.id, 'listing', listing.id);
    res.json({ listing });
  })
);

router.post(
  '/:id/verify',
  requirePermission('listings:verify'),
  asyncHandler(async (req, res) => {
    let listing = await one(
      `UPDATE listings SET verified = TRUE, verified_at = now(), verified_by = $2
        WHERE id = $1 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    /* Verified inventory is what the Projects page is for, so verifying is
       also what puts it there. A listing submitted against an existing project
       just joins it; a standalone one gets a project of its own, carrying over
       the details Core just checked. */
    if (!listing.project_id) {
      const project = await one(
        `INSERT INTO projects (id, name, builder, rera, status, units, possession, brochure_url)
         VALUES ($1,$2,$3,$4,'Verified',1,$5,$6) RETURNING *`,
        [
          newId('p'),
          listing.title,
          listing.builder || null,
          listing.rera_number || null,
          listing.possession || null,
          listing.brochure_url || null,
        ]
      );
      listing = await one('UPDATE listings SET project_id = $2 WHERE id = $1 RETURNING *', [
        listing.id,
        project.id,
      ]);
      await recordAudit(
        `Project ${project.name} created from verified listing`,
        req.user.id,
        'project',
        project.id
      );
    }

    await one(
      `UPDATE verifications SET status='verified', finished_at=now(),
              started_at = COALESCE(started_at, now()), assigned_to=$2
        WHERE listing_id=$1 AND status <> 'verified' RETURNING id`,
      [req.params.id, req.user.id]
    );
    await recordAudit(`Listing ${listing.title} verified`, req.user.id, 'listing', listing.id);
    if (listing.submitted_by) {
      await notify({
        userId: listing.submitted_by,
        type: 'verification',
        title: `Your listing "${listing.title}" was verified`,
      });
    }
    res.json({ listing });
  })
);

/* ---------- Photos ----------

   Each image is uploaded on its own, so a slow connection on site loses one
   photo rather than the whole batch, and a photo can be removed without
   re-uploading the rest. */

const MAX_PHOTO_BYTES = 3 * 1024 * 1024; /* per image, after the client downscales */
const MAX_PHOTOS_PER_LISTING = 30;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

router.get(
  '/:id/photos',
  asyncHandler(async (req, res) => {
    const { where, params } = scopeClause(req.user, 2);
    const listing = await one(`SELECT l.id FROM listings l WHERE l.id = $1 ${where}`, [
      req.params.id,
      ...params,
    ]);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    const photos = await many(
      `SELECT p.id, p.listing_id, p.data_url, p.content_type, p.caption, p.bytes,
              p.created_at, u.name AS uploaded_by_name
         FROM listing_photos p
         LEFT JOIN users u ON u.id = p.uploaded_by
        WHERE p.listing_id = $1
        ORDER BY p.created_at`,
      [req.params.id]
    );
    res.json({ photos });
  })
);

router.post(
  '/:id/photos',
  requirePermission('listings:write'),
  asyncHandler(async (req, res) => {
    const { where, params } = scopeClause(req.user, 2);
    const listing = await one(`SELECT l.id, l.title FROM listings l WHERE l.id = $1 ${where}`, [
      req.params.id,
      ...params,
    ]);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    const { dataUrl, caption } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'No image was received' });
    }

    const match = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
    if (!match) return res.status(400).json({ error: 'That file is not a readable image' });

    const [, contentType, b64] = match;
    if (!ALLOWED_TYPES.includes(contentType)) {
      return res.status(400).json({ error: 'Photos must be JPEG, PNG or WebP' });
    }

    /* base64 carries 3 bytes in every 4 characters. */
    const bytes = Math.floor((b64.length * 3) / 4);
    if (bytes > MAX_PHOTO_BYTES) {
      return res.status(413).json({ error: 'That image is too large — keep photos under 3 MB' });
    }

    const { n } = await one(
      'SELECT COUNT(*)::int AS n FROM listing_photos WHERE listing_id = $1',
      [req.params.id]
    );
    if (n >= MAX_PHOTOS_PER_LISTING) {
      return res
        .status(409)
        .json({ error: `A listing can hold ${MAX_PHOTOS_PER_LISTING} photos` });
    }

    const photo = await one(
      `INSERT INTO listing_photos (id, listing_id, data_url, content_type, caption, bytes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, listing_id, data_url, content_type, caption, bytes, created_at`,
      [
        newId('ph'),
        req.params.id,
        dataUrl.trim(),
        contentType,
        (caption || '').trim() || null,
        bytes,
        req.user.id,
      ]
    );
    await recordAudit(`Photo added to listing ${listing.title}`, req.user.id, 'listing', listing.id);
    res.status(201).json({ photo });
  })
);

router.delete(
  '/:id/photos/:photoId',
  requirePermission('listings:write'),
  asyncHandler(async (req, res) => {
    const { where, params } = scopeClause(req.user, 2);
    const listing = await one(`SELECT l.id, l.title FROM listings l WHERE l.id = $1 ${where}`, [
      req.params.id,
      ...params,
    ]);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    const photo = await one(
      'DELETE FROM listing_photos WHERE id = $1 AND listing_id = $2 RETURNING id',
      [req.params.photoId, req.params.id]
    );
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    await recordAudit(`Photo removed from listing ${listing.title}`, req.user.id, 'listing', listing.id);
    res.json({ deleted: true, id: photo.id });
  })
);

export default router;
