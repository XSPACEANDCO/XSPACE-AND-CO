import { Router } from 'express';
import { many, one } from '../db.js';
import { asyncHandler, requireAuth, requireModule, requirePermission } from '../middleware.js';
import { newId, notify, recordAudit } from '../helpers.js';

const router = Router();

/* The media pipeline, from the spec:
     creator / realtor  -> upload raw reels and shorts
     studio             -> claim, edit, deliver
     uploader           -> sees the status of their own items only */

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
      `SELECT m.*, u.name AS claimed_by_name
         FROM media m LEFT JOIN users u ON u.id = m.claimed_by
        WHERE m.uploaded_by = $1 ORDER BY m.created_at DESC`,
      [req.user.id]
    );
    res.json({ media: rows });
  })
);

/* Raw inbox: studio plus Founder/Core oversight. */
router.get(
  '/raw',
  requireModule('rawMedia'),
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT m.*, up.name AS uploaded_by_name, up.role AS uploaded_by_role,
              p.name AS project_name
         FROM media m
         LEFT JOIN users up ON up.id = m.uploaded_by
         LEFT JOIN projects p ON p.id = m.project_id
        WHERE m.status IN ('pending','in_progress')
        ORDER BY m.created_at ASC`
    );
    res.json({ media: rows });
  })
);

/* Finished library. */
router.get(
  '/library',
  requireModule('mediaLibrary'),
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT m.*, p.name AS project_name, up.name AS uploaded_by_name
         FROM media m
         LEFT JOIN projects p ON p.id = m.project_id
         LEFT JOIN users up ON up.id = m.uploaded_by
        WHERE m.status = 'delivered'
        ORDER BY m.delivered_at DESC NULLS LAST`
    );
    res.json({ media: rows });
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
        WHERE m.status IN ('pending','in_progress')
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

export default router;
