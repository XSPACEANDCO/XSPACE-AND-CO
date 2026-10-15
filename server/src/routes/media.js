import { Router } from 'express';
import { many, one } from '../db.js';
import { asyncHandler, requireAuth, requireModule, requirePermission } from '../middleware.js';
import { canDo, seesEverything } from '../rbac.js';
import { newId, notify, recordAudit, safeUrl } from '../helpers.js';

const router = Router();

/* The media pipeline.

     creator / realtor  upload raw reels and shorts
     studio             see everything, claim, edit, re-upload the cut
     founder / core     see everything, approve the cut or send it back

   The states run:

     pending ─▶ in_progress ─▶ qc ─▶ delivered ─▶ approved
                    ▲                     │
                    └──── changes_requested (with notes)

   "qc" is Studio checking its own cut before handing it over. It is optional:
   an editor can deliver straight from in_progress.

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
         p.name  AS project_name,
         /* Which project Studio is editing for, and the sheet to open for
            its specification: the project's first verified listing. */
         (SELECT li.area FROM listings li
           WHERE li.project_id = m.project_id AND li.verified
           ORDER BY li.verified_at NULLS LAST LIMIT 1) AS project_area,
         (SELECT li.id FROM listings li
           WHERE li.project_id = m.project_id AND li.verified
           ORDER BY li.verified_at NULLS LAST LIMIT 1) AS project_listing_id
    FROM media m
    LEFT JOIN users up ON up.id = m.uploaded_by
    LEFT JOIN users cl ON cl.id = m.claimed_by
    LEFT JOIN users ed ON ed.id = m.edited_by
    LEFT JOIN users rv ON rv.id = m.reviewed_by
    LEFT JOIN projects p ON p.id = m.project_id`;

const PRIORITIES = ['high', 'normal'];
const BLOCKERS = ['raw_media', 'property_info', 'creator_feedback'];

/* A due date arrives as whatever the form sent; anything unparseable is
   treated as "not given" rather than stored as garbage. */
function parseDue(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* Upload: creator, realtor or studio.

   The file is optional. Without one this is a production request — "make a
   reel of this project by Friday" — and it waits on raw media until somebody
   attaches the footage (PATCH /:id/meta).

   Founder and Core may also hand it to somebody (assignTo):
     a creator      it becomes the creator's content brief, as if they had
                    created it themselves, and waits for their content
     a studio member  it lands in their queue already claimed */
router.post(
  '/',
  requireModule('mediaUpload'),
  requirePermission('media:upload'),
  asyncHandler(async (req, res) => {
    const { title, kind, url, projectId, note, dueAt, priority, assignTo } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });
    if (priority && !PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: `priority must be one of ${PRIORITIES.join(', ')}` });
    }
    if (safeUrl(url) === undefined) {
      return res.status(400).json({ error: 'The link must start with http:// or https://' });
    }

    /* The project the footage is for — checked, so a mistyped id is a clear
       400 rather than a failed insert. Empty means "not for one project". */
    if (projectId) {
      const project = await one('SELECT id FROM projects WHERE id = $1', [projectId]);
      if (!project) return res.status(400).json({ error: 'That project does not exist' });
    }

    let assignee = null;
    if (assignTo) {
      if (!seesEverything(req.user.role)) {
        return res.status(403).json({ error: 'Only Founder or Core can assign work' });
      }
      assignee = await one('SELECT id, name, role FROM users WHERE id = $1 AND active', [assignTo]);
      if (!assignee || !['creator', 'studio'].includes(assignee.role)) {
        return res.status(400).json({ error: 'Work can be assigned to an active creator or Studio member' });
      }
    }
    const toCreator = assignee?.role === 'creator';
    const toStudio = assignee?.role === 'studio';

    const id = newId('m');
    const media = await one(
      `INSERT INTO media (id, title, kind, url, project_id, uploaded_by, note, due_at, priority, blocked_on,
                          claimed_by, assigned_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        id, title, kind || 'reel', url || null, projectId || null,
        toCreator ? assignee.id : req.user.id, note || null,
        parseDue(dueAt), priority || 'normal', url ? null : 'raw_media',
        toStudio ? assignee.id : null, assignee ? req.user.id : null,
      ]
    );

    if (toCreator) {
      /* Studio hears about it when the creator's content arrives. */
      await notify({ userId: assignee.id, type: 'media', title: `New content assignment: ${title}`, body: note });
    } else if (toStudio) {
      await notify({ userId: assignee.id, type: 'media', title: `Production task assigned to you: ${title}`, body: note });
    } else {
      await notify({
        role: 'studio',
        type: 'media',
        title: url ? `New raw media: ${title}` : `New production request: ${title}`,
        body: note,
      });
    }
    await recordAudit(
      assignee ? `Media ${title} assigned to ${assignee.name}` : `Media ${title} uploaded`,
      req.user.id,
      'media',
      id
    );
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
        WHERE m.status IN ('pending','in_progress','qc','changes_requested')
        ORDER BY
          CASE m.status WHEN 'changes_requested' THEN 0 WHEN 'in_progress' THEN 1
                        WHEN 'qc' THEN 1 ELSE 2 END,
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

/* The whole board, every state — what the Studio dashboard counts its
   pipeline from. Same audience as the raw inbox, so the same gate. */
router.get(
  '/board',
  requireModule('rawMedia'),
  asyncHandler(async (req, res) => {
    const rows = await many(
      `${MEDIA_SELECT}
        ORDER BY m.created_at DESC
        LIMIT 500`
    );
    res.json({ media: rows });
  })
);

/* Everything still queued for the signed-in studio partner: their own work
   plus whatever nobody has picked up yet. Due first, then high priority,
   then oldest — the order it should be worked in. */
router.get(
  '/pending',
  requireModule('pendingWorks'),
  asyncHandler(async (req, res) => {
    const rows = await many(
      `${MEDIA_SELECT}
        WHERE m.status IN ('pending','in_progress','qc','changes_requested')
          AND (m.claimed_by = $1 OR m.claimed_by IS NULL)
        ORDER BY m.due_at ASC NULLS LAST,
                 CASE m.priority WHEN 'high' THEN 0 ELSE 1 END,
                 m.created_at ASC`,
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

    /* The moves Studio can make from this button. Handing a cut over for
       approval is not one of them — that is /deliver, which requires the
       edited file — and nothing moves an approved cut: approval is final. It
       used to accept any status from any status, so an approved reel could
       be knocked back to "pending", or "delivered" set with no cut attached. */
    const NEXT = {
      pending: ['in_progress', 'rejected'],
      in_progress: ['qc', 'pending', 'rejected'],
      qc: ['in_progress', 'rejected'],
      changes_requested: ['in_progress', 'rejected'],
      delivered: [],
      approved: [],
      rejected: [],
    };
    const existing = await one('SELECT * FROM media WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Media not found' });
    if (!(NEXT[existing.status] || []).includes(status)) {
      return res.status(409).json({
        error: `Cannot move this item from ${existing.status.replace('_', ' ')} to ${String(status).replace('_', ' ')}`,
      });
    }
    /* Rejecting outright is a Founder/Core decision, not an editor's. */
    if (status === 'rejected' && !seesEverything(req.user.role)) {
      return res.status(403).json({ error: 'Only Founder or Core can reject an item' });
    }

    const media = await one(
      `UPDATE media SET status=$2,
              claimed_by = CASE WHEN $2 = 'in_progress' THEN $3
                                WHEN $2 = 'pending' THEN NULL ELSE claimed_by END
        WHERE id=$1 RETURNING *`,
      [req.params.id, status, req.user.id]
    );

    /* Close the loop for whoever uploaded it. */
    if (media.uploaded_by) {
      await notify({
        userId: media.uploaded_by,
        type: 'media',
        title: `"${media.title}" is now ${status === 'qc' ? 'in Studio QC' : status.replace('_', ' ')}`,
      });
    }
    await recordAudit(`Media ${media.title} -> ${status}`, req.user.id, 'media', media.id);
    res.json({ media });
  })
);

/* ---------- Scheduling and bookkeeping ----------

   The fields around an item rather than its state: when it is due, how
   urgent it is, what it is stuck on, the footage itself if it arrived after
   the request, and how many people saw the published piece.

   Studio, Founder and Core may set any of them. The uploader may attach
   footage and record views on their own item, and nothing else — a creator
   does not get to reprioritise Studio's queue. */
router.patch(
  '/:id/meta',
  requireAuth,
  asyncHandler(async (req, res) => {
    const existing = await one('SELECT * FROM media WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Media not found' });

    const processes = canDo('media:process', req.user.role);
    const owns = existing.uploaded_by === req.user.id;
    if (!processes && !owns) return res.status(404).json({ error: 'Media not found' });

    const body = req.body || {};
    const studioOnly = ['dueAt', 'priority', 'blockedOn', 'projectId'].filter((k) => k in body);
    if (!processes && studioOnly.length) {
      return res.status(403).json({ error: 'Only Studio, Founder or Core can change scheduling' });
    }
    if (body.url && !safeUrl(body.url)) {
      return res.status(400).json({ error: 'The link must start with http:// or https://' });
    }
    if (body.priority && !PRIORITIES.includes(body.priority)) {
      return res.status(400).json({ error: `priority must be one of ${PRIORITIES.join(', ')}` });
    }
    if (body.blockedOn && !BLOCKERS.includes(body.blockedOn)) {
      return res.status(400).json({ error: `blockedOn must be one of ${BLOCKERS.join(', ')}` });
    }
    let views = null;
    if ('views' in body && body.views !== '' && body.views !== null) {
      views = Number.parseInt(body.views, 10);
      if (!Number.isFinite(views) || views < 0) {
        return res.status(400).json({ error: 'views must be a whole number' });
      }
    }

    /* Each field is only written when it was sent, so a request that sets
       the due date does not wipe the blocker. '' clears a field. */
    const sets = [];
    const params = [req.params.id];
    const put = (col, value) => {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    };
    if ('dueAt' in body) put('due_at', parseDue(body.dueAt));
    if ('priority' in body) put('priority', body.priority || 'normal');
    if ('blockedOn' in body) put('blocked_on', body.blockedOn || null);
    if ('views' in body) put('views', views);
    /* Linking footage that arrived without a project to the one it is for. */
    if ('projectId' in body) {
      if (body.projectId) {
        const project = await one('SELECT id FROM projects WHERE id = $1', [body.projectId]);
        if (!project) return res.status(400).json({ error: 'That project does not exist' });
      }
      put('project_id', body.projectId || null);
    }
    /* New footage from the uploader on an item sent back to them is their
       resubmission. */
    const resubmitting =
      body.url && owns && existing.blocked_on === 'creator_feedback' &&
      String(body.url).trim() !== existing.url;
    if (body.url) {
      put('url', String(body.url).trim());
      /* The footage was the thing it was waiting for. */
      if (
        (existing.blocked_on === 'raw_media' || resubmitting) &&
        !('blockedOn' in body)
      ) {
        put('blocked_on', null);
      }
    }
    if (!sets.length) return res.json({ media: existing });

    const media = await one(`UPDATE media SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params);

    if (body.url && !existing.url) {
      await notify({ role: 'studio', type: 'media', title: `Raw media attached: ${media.title}` });
    } else if (resubmitting) {
      await notify({ role: 'core', type: 'media', title: `Revised content submitted: ${media.title}` });
      await notify({ role: 'founder', type: 'media', title: `Revised content submitted: ${media.title}` });
    }
    await recordAudit(`Media ${media.title} details updated`, req.user.id, 'media', media.id);
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
    if (!safeUrl(editedUrl)) {
      return res.status(400).json({ error: 'The link must start with http:// or https://' });
    }

    const existing = await one('SELECT * FROM media WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Media not found' });
    if (existing.status === 'approved' || existing.status === 'rejected') {
      return res.status(409).json({ error: `That item has already been ${existing.status}` });
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

/* ---------- Back to the creator ----------

   The review above is of Studio's edited cut. This is the creator's side of
   the loop: their raw content is not usable — reshoot, wrong property, poor
   audio — so it goes back to them with notes. The item waits on
   creator_feedback until they attach new content (PATCH /:id/meta). */
router.post(
  '/:id/request-revision',
  requirePermission('media:review'),
  asyncHandler(async (req, res) => {
    const notes = String(req.body?.notes || '').trim();
    if (!notes) {
      return res.status(400).json({ error: 'Say what needs changing — the creator only gets these notes' });
    }
    const existing = await one(
      `SELECT m.*, u.role AS uploader_role FROM media m
         LEFT JOIN users u ON u.id = m.uploaded_by WHERE m.id = $1`,
      [req.params.id]
    );
    if (!existing) return res.status(404).json({ error: 'Media not found' });
    if (existing.uploader_role !== 'creator') {
      return res.status(409).json({ error: 'Only a creator’s content can be sent back to them' });
    }
    if (!['pending', 'in_progress', 'qc', 'changes_requested'].includes(existing.status)) {
      return res.status(409).json({ error: `That item is already ${existing.status}` });
    }

    const media = await one(
      `UPDATE media SET blocked_on = 'creator_feedback', review_notes = $2,
              reviewed_at = now(), reviewed_by = $3
        WHERE id = $1 RETURNING *`,
      [existing.id, notes, req.user.id]
    );
    await notify({ userId: media.uploaded_by, type: 'media', title: `Revision required: ${media.title}`, body: notes });
    await recordAudit(`Media ${media.title} sent back to its creator`, req.user.id, 'media', media.id);
    res.json({ media });
  })
);

export default router;
