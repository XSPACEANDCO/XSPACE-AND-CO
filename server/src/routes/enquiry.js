import { Router } from 'express';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { one, query } from '../db.js';
import { asyncHandler } from '../middleware.js';
import { newId, notify, recordAudit } from '../helpers.js';
import { EMAIL_RE } from '../clientJourney.js';

/* The public website's enquiry form.

     POST /api/public/enquiry

   Every "Get in touch" / submit on the landing page lands here and becomes a
   lead in the CRM, unassigned, for Founder and Core to pick up. No login: the
   form is public by nature. What keeps it honest is the rate limit, a hidden
   honeypot field, and a server that only ever accepts the fields it knows,
   trimmed to sane lengths.

   A repeat enquiry from a phone number already in the CRM is added to that
   client's notes instead of creating a duplicate.

   Mounted in app.js before the CORS allow-list: the website lives on another
   origin (Vercel), and this one route has to answer it. The site sends the
   body as text/plain, which the browser treats as a simple request with no
   preflight, so it can also use keepalive and survive the visitor closing
   the tab. JSON is accepted too, for anything else that posts here. */
const router = Router();

router.use(cors({ origin: '*', methods: ['POST'] }));
router.use(express.text({ type: 'text/plain', limit: '20kb' }));
router.use(express.json({ limit: '20kb' }));

router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests — please try again in a few minutes' },
  })
);

/* The website's "Looking for" options, filed under the portal's property
   types (src/leadStatus.js). Bedroom counts are a configuration, not a type. */
const TYPE_MAP = {
  '2 BHK': { configuration: '2 BHK' },
  '3 BHK': { configuration: '3 BHK' },
  '4+ BHK': { configuration: '4+ BHK' },
  Villa: { propertyType: 'villa' },
  'Independent House': { propertyType: 'independent_house' },
  'Gated Community Apartments': { propertyType: 'gated' },
  'Gated Community High-Rise': { propertyType: 'gated_highrise' },
  'Semi-Gated / Standalone': { propertyType: 'semi_gated' },
  'Office Space': { propertyType: 'commercial', propertySubtype: 'office_space' },
  'Commercial Building': { propertyType: 'commercial' },
  'Retail Shop / Showroom': { propertyType: 'commercial', propertySubtype: 'shops' },
  'Warehouse / Industrial': { propertyType: 'industrial' },
  Land: { propertyType: 'land' },
};

const text = (v, max = 200) => String(v ?? '').trim().slice(0, max);

/* A 10-digit Indian mobile, or null. Accepts +91 / 0 prefixes and spaces. */
function tenDigits(raw) {
  let p = String(raw ?? '').replace(/\D/g, '');
  if (p.length === 12 && p.startsWith('91')) p = p.slice(2);
  if (p.length === 11 && p.startsWith('0')) p = p.slice(1);
  return /^[6-9]\d{9}$/.test(p) ? p : null;
}

const STAMP = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: 'Invalid request' });
      }
    }
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Invalid request' });

    /* Bots fill every field; people never see this one. Pretend it worked. */
    if (text(body.website)) return res.status(201).json({ ok: true });

    const name = text(body.name, 120);
    const phone = tenDigits(body.phone);
    if (!name) return res.status(400).json({ error: 'Please enter your name' });
    if (!phone) return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });

    const intent = text(body.intent, 80) || 'Website enquiry';
    const lookingFor = text(body.propertyType, 80);
    const mapped = TYPE_MAP[lookingFor] || {};
    const area = text(body.preferredArea, 80);
    const budget = text(body.budget, 80);
    const timeline = text(body.timeline, 80);
    const note = text(body.note, 1000);
    /* Saved as the client's email, which the client-journey emails go to.
       One that does not look like an address is left out, not refused. */
    const rawEmail = text(body.email, 200).toLowerCase();
    const email = EMAIL_RE.test(rawEmail) ? rawEmail : null;
    const page = text(body.page, 300);

    /* What the visitor asked for, in words, so nothing the form collected is
       lost even where it has no column of its own. */
    const summary = [
      `${STAMP.format(new Date())} — website enquiry: ${intent}`,
      lookingFor && `Looking for: ${lookingFor}`,
      area && `Area: ${area}`,
      budget && `Budget: ${budget}`,
      timeline && `Timeline: ${timeline}`,
      note,
      page && `Page: ${page}`,
    ].filter(Boolean).join('\n');

    /* Same phone already in the CRM: add to that client rather than
       creating a second one. Compared on the last ten digits, because the
       portal stores numbers however people typed them. */
    const existing = await one(
      `SELECT id, name, assigned_to, notes FROM leads
        WHERE status <> 'Dropped'
          AND right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $1
        ORDER BY created_at DESC LIMIT 1`,
      [phone]
    );

    if (existing) {
      await query(
        `UPDATE leads SET notes = $2, last_interaction_at = now(),
                email = CASE WHEN coalesce(email, '') = '' THEN $3 ELSE email END
          WHERE id = $1`,
        [existing.id, [existing.notes, summary].filter(Boolean).join('\n\n'), email]
      );
      const title = `Repeat website enquiry: ${existing.name}`;
      if (existing.assigned_to) {
        await notify({ userId: existing.assigned_to, type: 'lead', title, body: intent });
      } else {
        for (const role of ['founder', 'core']) await notify({ role, type: 'lead', title, body: intent });
      }
      await recordAudit(`Website enquiry added to client — ${intent}`, null, 'lead', existing.id);
      return res.status(201).json({ ok: true });
    }

    const id = newId('c');
    await query(
      `INSERT INTO leads (id, name, phone, source, budget, status, temperature, property_type,
                          property_subtype, configuration, preferred_area, timeline, notes,
                          email, last_interaction_at)
       VALUES ($1,$2,$3,'Website',$4,'New','warm',$5,$6,$7,$8,$9,$10,$11, now())`,
      [
        id, name, '+91' + phone, budget || null,
        mapped.propertyType || null, mapped.propertySubtype || null, mapped.configuration || null,
        area || null, timeline || null, summary, email,
      ]
    );
    for (const role of ['founder', 'core']) {
      await notify({
        role, type: 'lead',
        title: `New website enquiry: ${name}`,
        body: `${intent} — unassigned, pick it up in the CRM.`,
      });
    }
    await recordAudit(`Client created from website enquiry — ${intent}`, null, 'lead', id);
    res.status(201).json({ ok: true });
  })
);

export default router;
