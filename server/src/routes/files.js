import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { one } from '../db.js';
import { asyncHandler } from '../middleware.js';
import { newId } from '../helpers.js';

const router = Router();

/* File storage.

   Uploading needs a signed-in account; reading back does not, because a
   browser rendering <a href="…">, <img src="…"> or <video src="…"> cannot
   attach an Authorization header. The read URL instead carries a 32-byte
   random access key, so the link itself is the credential: a file id alone
   opens nothing. Links are therefore shareable by whoever holds them, which
   is the point — a brochure link has to work when it is pasted to a client.
   Do not put anything here that should not travel that way.

   Files live in Postgres rather than on disk because Render wipes the
   filesystem on every deploy. That puts a real ceiling on size: this is right
   for brochures, floor plans, price sheets and photos, and wrong for raw
   video. Long video belongs on Drive, YouTube or Instagram with the link
   stored here, or on object storage once there is an account for it. */

const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'video/mp4', 'video/quicktime', 'video/webm',
];

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { dataUrl, filename } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'No file was received' });
    }

    const match = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
    if (!match) return res.status(400).json({ error: 'That file could not be read' });

    const [, contentType, b64] = match;
    if (!ALLOWED.includes(contentType)) {
      return res.status(415).json({
        error: 'Only images, PDFs and short video clips can be uploaded here',
      });
    }

    /* base64 carries 3 bytes in every 4 characters. */
    const bytes = Math.floor((b64.length * 3) / 4);
    if (bytes > MAX_BYTES) {
      return res.status(413).json({
        error: `That file is ${(bytes / 1024 / 1024).toFixed(1)} MB — the limit is 8 MB. `
          + 'For long video, paste a Drive, YouTube or Instagram link instead.',
      });
    }

    const id = newId('f');
    const accessKey = randomBytes(32).toString('hex');
    await one(
      `INSERT INTO uploads (id, access_key, filename, content_type, data, bytes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [id, accessKey, (filename || 'file').slice(0, 200), contentType, b64, bytes, req.user.id]
    );

    res.status(201).json({
      id,
      url: `/api/files/${id}/${accessKey}`,
      filename: filename || 'file',
      contentType,
      bytes,
    });
  })
);

/* Deliberately outside requireAuth — see the note at the top. app.js mounts
   this router before the /api auth gate. */
export const publicFileRouter = Router();

publicFileRouter.get(
  '/:id/:key',
  asyncHandler(async (req, res) => {
    const file = await one(
      'SELECT access_key, filename, content_type, data FROM uploads WHERE id = $1',
      [req.params.id]
    );
    /* Same answer for "no such file" and "wrong key", so the endpoint cannot
       be used to discover which ids exist. */
    if (!file || file.access_key !== req.params.key) {
      return res.status(404).json({ error: 'File not found' });
    }

    const buffer = Buffer.from(file.data, 'base64');
    res.setHeader('Content-Type', file.content_type);
    res.setHeader('Content-Length', buffer.length);
    /* The key never changes for a given file, so the bytes never change
       either — it is safe to cache hard. */
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${file.filename.replace(/["\\]/g, '')}"`
    );
    res.end(buffer);
  })
);

export default router;
