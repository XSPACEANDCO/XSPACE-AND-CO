import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { many, one } from '../db.js';
import { asyncHandler } from '../middleware.js';
import { PROPERTY_TYPES } from '../leadStatus.js';
import * as journey from '../clientJourney.js';

/* The client's pages. No login: the token in the link from their email is
   the permission (client_links), and it opens only that client's own page —
   their shortlist, their answer to a visit, their feedback or referral form,
   or the unsubscribe confirmation.

     GET  /api/public/c/:token                 what the page shows
     POST /api/public/c/:token                 the client's answer
     GET  /api/public/c/:token/photo/:photoId  a shortlisted project's photo

   Nothing internal is ever returned: no other clients, no commission or
   negotiation figures, no partner records. Mounted before the token gate in
   app.js. */
const router = Router();

router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests — please try again in a few minutes' },
  })
);

/* Writes are rarer and worth a tighter brake. */
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again in a few minutes' },
});

async function resolve(token) {
  if (!/^[\w-]{20,80}$/.test(token || '')) return null;
  return one(
    `SELECT c.*, l.name AS client_name FROM client_links c
       JOIN leads l ON l.id = c.lead_id
      WHERE c.token = $1 AND (c.expires_at IS NULL OR c.expires_at > now())`,
    [token]
  );
}

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';
const typeLabel = (key) => PROPERTY_TYPES.find((p) => p.key === key)?.label || null;
const GONE = { error: 'This link has expired or is no longer valid. Reply to our email and we will help.' };

async function shortlistItems(link) {
  const rows = await many(
    `SELECT s.id AS item_id, s.note, s.interested_at, ${journey.CLIENT_LISTING_FIELDS}
       FROM lead_shortlist s
       JOIN listings l ON l.id = s.listing_id
       LEFT JOIN projects p ON p.id = l.project_id
      WHERE s.lead_id = $1 AND s.sent_at IS NOT NULL AND l.verified
      ORDER BY s.sent_at, s.created_at`,
    [link.lead_id]
  );
  const items = [];
  for (const r of rows) {
    const photos = await many('SELECT id FROM listing_photos WHERE listing_id = $1 ORDER BY created_at LIMIT 12', [r.id]);
    items.push({
      id: r.item_id,
      title: r.title,
      project: r.project_name && r.project_name !== r.title ? r.project_name : null,
      location: journey.locationOf(r),
      type: typeLabel(r.property_type),
      configuration: r.configuration || r.extent || null,
      price: r.all_inclusive || r.price || r.base_price || null,
      possession: r.possession,
      builder: r.builder,
      size: r.carpet_area || r.super_built_up || null,
      facing: r.facing,
      amenities: String(r.amenities || '').split('\n').map((a) => a.trim()).filter(Boolean),
      verification: [
        r.verified && 'Verified by Xspace',
        r.rera_number && `RERA ${r.rera_number}`,
        r.approval,
        r.bank_approved && `Bank approved: ${r.bank_approved}`,
      ].filter(Boolean),
      note: r.note,
      photos: photos.map((p) => `/api/public/c/${link.token}/photo/${p.id}`),
      links: [
        ['Brochure', r.brochure_url],
        ['Floor plan', r.floor_plan_url],
        ['Layout plan', r.layout_plan_url],
        ['Video', r.video_link],
      ]
        .filter(([, url]) => url)
        .map(([label, url]) => ({ label, url: journey.absoluteUrl(url) })),
      interested: Boolean(r.interested_at),
    });
  }
  return items;
}

router.get(
  '/c/:token',
  asyncHandler(async (req, res) => {
    const link = await resolve(req.params.token);
    if (!link) return res.status(404).json(GONE);
    const base = { kind: link.kind, name: firstName(link.client_name) };

    if (link.kind === 'shortlist') return res.json({ ...base, items: await shortlistItems(link) });

    if (link.kind === 'visit') {
      const v = await one(
        `SELECT v.scheduled_at, v.client_response, li.title FROM visits v
           LEFT JOIN listings li ON li.id = v.listing_id
          WHERE v.id = $1 AND v.lead_id = $2`,
        [link.ref_id, link.lead_id]
      );
      if (!v) return res.status(404).json(GONE);
      return res.json({ ...base, project: v.title, scheduledAt: v.scheduled_at, answer: v.client_response });
    }

    if (link.kind === 'feedback') {
      const f = await one('SELECT overall FROM client_feedback WHERE lead_id = $1', [link.lead_id]);
      return res.json({ ...base, submitted: Boolean(f) });
    }

    if (link.kind === 'unsubscribe') {
      const l = await one('SELECT email_opt_out_at FROM leads WHERE id = $1', [link.lead_id]);
      return res.json({ ...base, unsubscribed: Boolean(l?.email_opt_out_at) });
    }

    return res.json(base); // referral
  })
);

router.post(
  '/c/:token',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const link = await resolve(req.params.token);
    if (!link) return res.status(404).json(GONE);
    const body = req.body || {};

    if (link.kind === 'shortlist') {
      const item = await journey.shortlistInterest(link.lead_id, body.itemId);
      if (!item) return res.status(404).json({ error: 'That project is not on your shortlist' });
      return res.json({ ok: true });
    }

    if (link.kind === 'visit') {
      const visit = await journey.visitAnswer(link.lead_id, link.ref_id, body.answer);
      if (!visit) return res.status(400).json({ error: 'Please choose one of the options' });
      return res.json({ ok: true });
    }

    if (link.kind === 'feedback') {
      const out = await journey.submitFeedback(link.lead_id, body);
      return out.error ? res.status(400).json(out) : res.json({ ok: true });
    }

    if (link.kind === 'referral') {
      const out = await journey.submitReferral(link.lead_id, body);
      return out.error ? res.status(400).json(out) : res.json({ ok: true });
    }

    if (link.kind === 'unsubscribe') {
      await journey.unsubscribe(link.lead_id);
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Nothing to do here' });
  })
);

/* A photo of a project on this client's sent shortlist. Email clients fetch
   it from their own servers, hence the cross-origin header. */
router.get(
  '/c/:token/photo/:photoId',
  asyncHandler(async (req, res) => {
    const link = await resolve(req.params.token);
    if (!link || link.kind !== 'shortlist') return res.status(404).end();
    const photo = await one(
      `SELECT ph.data_url, ph.content_type FROM listing_photos ph
         JOIN lead_shortlist s ON s.listing_id = ph.listing_id AND s.lead_id = $2 AND s.sent_at IS NOT NULL
        WHERE ph.id = $1`,
      [req.params.photoId, link.lead_id]
    );
    if (!photo) return res.status(404).end();
    const b64 = String(photo.data_url).split(',')[1] || '';
    res.set({
      'Content-Type': photo.content_type,
      'Cache-Control': 'public, max-age=86400',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(Buffer.from(b64, 'base64'));
  })
);

export default router;
