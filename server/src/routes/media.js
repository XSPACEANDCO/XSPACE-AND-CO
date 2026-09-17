import { Router } from 'express';
import { many, one } from '../db.js';
import { asyncHandler, requireAuth, requireModule, requirePermission } from '../middleware.js';
import { seesEverything } from '../rbac.js';
import { newId, notify, recordAudit } from '../helpers.js';

const router = Router();

/* The media pipeline.

     creator / realtor  upload raw reels and shorts
     studio             see everything, claim, edit, re-upload the cut
     founder / core     see everything, approve the cut or send it back

   The states run:

     pending ─▶ in_progress ─▶ delivered ─▶ approved
                    ▲              │
                    └── changes_requested (with notes)

   "delivered" means the editor has re-uploaded a finished cut and it is
   waiting on review — not that it has shipped. Only `approved` is final,
   which is what keeps unreviewed work out of the finished library.

   Who sees which rows is decided here, not in the browser: an uploader is
   only ever handed their own items. */

/* Everything a row needs to render anywhere in the pipeline. */
const MEDIA_SELECT = `
  SELECT m.*,
         up.name AS uploaded_by_name, up.role AS uploaded_by_role,
         cl.name AS claimed_by_name,
         ed.name AS edited_by_name,
         rv.name AS reviewed_by_name,
         p.name  AS project_name
    FROM media m
    LEFT JOIN users up ON up.id = m.uploaded_by
    LEFT JOIN users cl ON cl.id = m.claimed_by
    LEFT JOIN users ed ON ed.id = m.edited_by
    LEFT JOIN users rv ON rv.id = m.reviewed_by
    LEFT JOIN projects p ON p.id = m.project_id`;

/* Upload: creator, realtor or studio. */
router.post(
  '/',
  requireModule('mediaUpload'),
  requirePermission('media:upload'),
  asyncHandler(async (req, res) => {
    const { title, kind, url, projectId, note } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });

    const id = newId('m');
    const media = await one(
      `INSERT INTO media (id, title, kind, url, project_id, uploaded_by, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, title, kind || 'reel', url || null, projectId || null, req.user.id, note || null]
    );
    await notify({ role: 'studio', type: 'media', title: `New raw media: ${title}`, body: note });
    await recordAudit(`Media ${title} uploaded`, req.user.id, 'media', id);
    res.status(201).json({ media });
  })
);

/* My uploads and their editing status — what the creator dashboard shows. */
router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await many(
      `${MEDIA_SELECT}
        WHERE m.uploaded_by = $1 ORDER BY m.created_at DESC`,
      [req.user.id]
    );
    res.json({ media: rows });
  })
);

/* Raw inbox: everything anybody has uploaded, for Studio and for Founder and
   Core. Creators and realtors are not on this module at all — they get
   /mine — so there is no per-row filtering to do: reaching this route is
   itself the permission to see all of it.

   Items sent back for changes reappear here, because from the editor's side
   that is exactly what they are: work waiting to be picked up again. */
router.get(
  '/raw',
  requireModule('rawMedia'),
  asyncHandler(async (req, res) => {
    const rows = await many(
      `${MEDIA_SELECT}
        WHERE m.status IN ('pending','in_progress','changes_requested')
        ORDER BY
          CASE m.status WHEN 'changes_requested' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
          m.created_at ASC`
    );
    res.json({ media: rows, canReview: seesEverything(req.user.role) });
  })
);

/* The library: edited cuts, both the ones waiting on review and the ones
   already approved. Founder and Core review here; Studio watches what
   happened to their work. */
router.get(
  '/library',
  requireModule('mediaLibrary'),
  asyncHandler(async (req, res) => {
    const rows = await many(
      `${MEDIA_SELECT}
        WHERE m.status IN ('delivered','approved')
        ORDER BY
          CASE m.status WHEN 'delivered' THEN 0 ELSE 1 END,
          COALESCE(m.edited_at, m.delivered_at, m.created_at) DESC`
    );
    res.json({ media: rows, canReview: seesEverything(req.user.role) });
  })
);

/* Everything still queued for the signed-in studio partner. */
router.get(
  '/pending',
  requireModule('pendingWorks'),
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT m.*, p.name AS project_name
         FROM media m LEFT JOIN projects p ON p.id = m.project_id
        WHERE m.status IN ('pending','in_progress','changes_requested')
          AND (m.claimed_by = $1 OR m.claimed_by IS NULL)
        ORDER BY m.created_at ASC`,
      [req.user.id]
    );
    res.json({ media: rows });
  })
);

router.patch(
  '/:id/status',
  requirePermission('media:process'),
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    const allowed = ['pending', 'in_progress', 'delivered', 'rejected'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
    }

    const media = await one(
      `UPDATE media SET status=$2,
              claimed_by = CASE WHEN $2 = 'in_progress' THEN $3 ELSE claimed_by END,
              delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END
        WHERE id=$1 RETURNING *`,
      [req.params.id, status, req.user.id]
    );
    if (!media) return res.status(404).json({ error: 'Media not found' });

    /* Close the loop for whoever uploaded it. */
    if (media.uploaded_by) {
      await notify({
        userId: media.uploaded_by,
        type: 'media',
        title: `"${media.title}" is now ${status.replace('_', ' ')}`,
      });
    }
    await recordAudit(`Media ${media.title} -> ${status}`, req.user.id, 'media', media.id);
    res.json({ media });
  })
);

/* ---------- The editor hands work back ----------

   Re-uploading the finished cut. The raw file stays where it is: if the edit
   is rejected, the editor needs the original to start again from. */
router.post(
  '/:id/deliver',
  requirePermission('media:process'),
  asyncHandler(async (req, res) => {
    const { editedUrl, note } = req.body || {};
    if (!editedUrl) {
      return res.status(400).json({ error: 'Upload the edited file, or paste a link to it' });
    }

    const existing = await one('SELECT * FROM media WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Media not found' });
    if (existing.status === 'approved') {
      return res.status(409).json({ error: 'That cut has already been approved' });
    }

    const media = await one(
      `UPDATE media SET
         status = 'delivered',
         edited_url = $2,
         edited_at = now(),
         edited_by = $3,
         delivered_at = now(),
         claimed_by = COALESCE(claimed_by, $3),
         note = COALESCE($4, note),
         /* Each hand-back is a new revision, so "v3" in the library means the
            editor has genuinely been round three times. */
         revision = revision + 1,
         review_notes = NULL
       WHERE id = $1 RETURNING *`,
      [req.params.id, editedUrl, req.user.id, note || null]
    );

    await notify({
      role: 'core',
      type: 'media',
      title: `Edited cut ready to review: ${media.title}`,
      body: note || null,
    });
    await notify({ role: 'founder', type: 'media', title: `Edited cut ready to review: ${media.title}` });
    if (media.uploaded_by) {
      await notify({
        userId: media.uploaded_by,
        type: 'media',
        title: `"${media.title}" has been edited and sent for review`,
      });
    }
    await recordAudit(`Media ${media.title} delivered (v${media.revision})`, req.user.id, 'media', media.id);
    res.json({ media });
  })
);

/* ---------- Founder / Core decide ----------

   Approve it, or send it back with notes. Sending back returns the item to
   the editor's inbox carrying the reason, which is the whole point of the
   round trip — a rejection with no note is not actionable. */
router.post(
  '/:id/review',
  requirePermission('media:review'),
  asyncHandler(async (req, res) => {
    const { decision, notes } = req.body || {};
    if (!['approve', 'changes'].includes(decision)) {
      return res.status(400).json({ error: "decision must be 'approve' or 'changes'" });
    }
    if (decision === 'changes' && !(notes || '').trim()) {
      return res.status(400).json({ error: 'Say what needs changing — the editor only gets these notes' });
    }

    const existing = await one('SELECT * FROM media WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Media not found' });
    if (existing.status !== 'delivered') {
      return res.status(409).json({
        error: 'Only an edited cut that is waiting on review can be approved or sent back',
      });
    }

    const media = await one(
      `UPDATE media SET
         status = $2,
         review_notes = $3,
         reviewed_at = now(),
         reviewed_by = $4
       WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        decision === 'approve' ? 'approved' : 'changes_requested',
        decision === 'approve' ? (notes || '').trim() || null : notes.trim(),
        req.user.id,
      ]
    );

    /* Tell the editor, and tell whoever shot it. */
    const headline =
      decision === 'approve'
        ? `Approved: ${media.title}`
        : `Changes requested on ${media.title}`;
    for (const userId of new Set([media.edited_by, media.claimed_by].filter(Boolean))) {
      await notify({ userId, type: 'media', title: headline, body: media.review_notes });
    }
    if (media.uploaded_by) {
      await notify({ userId: media.uploaded_by, type: 'media', title: headline });
    }

    await recordAudit(
      `Media ${media.title} ${decision === 'approve' ? 'approved' : 'sent back for changes'}`,
      req.user.id,
      'media',
      media.id
    );
    res.json({ media });
  })
);

export default router;
