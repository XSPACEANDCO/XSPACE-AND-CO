import { config } from './config.js';
import { many, one, query } from './db.js';
import { notify, recordAudit } from './helpers.js';
import { sendEmail } from './mailer.js';
import { renderEmail, ROLE_PREFIX } from './emailTemplates.js';
import { INTERNAL_ROLES } from './rbac.js';

/* The member lifecycle and the three role pipelines, as automations.

     MEMBER APPROVED -> ACCOUNT CREATED -> WELCOME (xx-01) + PORTAL ACCESS (xx-02)
       -> FIRST LOGIN (member is Active) -> ONBOARDING
            incomplete: reminder 1 -> reminder 2 -> Core team follow-up (xx-03)
            complete:   KYC verified + rules acknowledged -> role workflow

     Realtor  listing submitted -> review -> approved | corrections -> resubmit
              -> visit scheduled -> reminder -> rescheduled -> completed
     Creator  assigned -> submitted -> review -> approved | revision -> resubmit
              -> lead generated -> weekly performance summary
     Studio   task -> deadline reminder -> submitted -> review
              -> approved | revision -> task completed

   Beyond the partner pipelines:
     Clients  site visit confirmed / reminder / rescheduled / thank-you
              (CL-01..04), only when the lead has an email address
     Team     Founder and Core get a 9am daily digest (XS-01) and an email
              when a partner's onboarding is escalated to them (XS-02),
              alongside the in-app notifications

   Routes call the event functions below at the moment something happens.
   The time-based steps (reminders, escalation, the weekly summary) run from
   tick(), which the scheduler calls every few minutes and an external cron
   can call through POST /api/automations/tick.

   Nothing here is allowed to fail the request that triggered it: an email
   provider being down must not stop a listing being approved. Every entry
   point catches and logs. */

const PARTNER_ROLES = Object.keys(ROLE_PREFIX);

function safe(name, fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(`[automations] ${name} failed:`, err);
      return undefined;
    }
  };
}

/* Email one member with their role's version of a template. Internal
   accounts and deactivated ones get nothing — every template is a partner
   email. */
async function emailMember(user, number, ctx, dedupeKey) {
  if (!user || !user.email || !user.active || !PARTNER_ROLES.includes(user.role)) return null;
  const code = `${ROLE_PREFIX[user.role]}-${number}`;
  const { subject, html, text } = renderEmail(code, { user, ...ctx });
  return sendEmail({
    userId: user.id,
    to: user.email,
    code,
    dedupeKey: `${code}:${dedupeKey}`,
    subject,
    html,
    text,
  });
}

/* Email every active Founder and Core member (XS-xx). */
async function emailTeam(number, ctx, dedupeKey) {
  const code = `XS-${number}`;
  const team = await many('SELECT * FROM users WHERE role = ANY($1) AND active', [INTERNAL_ROLES]);
  for (const user of team) {
    if (!user.email) continue;
    const { subject, html, text } = renderEmail(code, { user, ...ctx });
    await sendEmail({ userId: user.id, to: user.email, code, dedupeKey: `${code}:${dedupeKey}:${user.id}`, subject, html, text });
  }
}

/* Email the client on a site visit (CL-xx), when their lead has an address. */
async function emailClient(visit, number, dedupeKey) {
  if (!visit?.client_email || !EMAIL_RE.test(visit.client_email)) return null;
  const code = `CL-${number}`;
  const client = { name: visit.client_name || 'there' };
  const { subject, html, text } = renderEmail(code, { client, visit });
  return sendEmail({ to: visit.client_email, code, dedupeKey: `${code}:${dedupeKey}`, subject, html, text });
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const userById = (id) => (id ? one('SELECT * FROM users WHERE id = $1', [id]) : null);

async function notifyInternal(title, body = null, type = 'onboarding') {
  for (const role of INTERNAL_ROLES) await notify({ role, type, title, body });
}

/* --------------------------------------------------------------------------
   Lifecycle
   -------------------------------------------------------------------------- */

/* Account created: welcome, then sign-in details. The password is the one
   handed back to whoever created the account, so the member can sign in
   without waiting for it to be passed on by hand. */
export const accountCreated = safe('accountCreated', async (user, password) => {
  if (INTERNAL_ROLES.includes(user.role)) {
    /* The internal team has no onboarding to do. */
    await query('UPDATE users SET onboarding_completed_at = now() WHERE id = $1', [user.id]);
    return;
  }
  await emailMember(user, '01', {}, user.id);
  await emailMember(user, '02', { password }, user.id);
});

/* A Founder/Core password reset sends fresh portal access details. Keyed on
   the token version so each reset is its own email. */
export const passwordReset = safe('passwordReset', async (userId, password) => {
  const user = await userById(userId);
  if (!user) return;
  await emailMember(user, '02', { password }, `${user.id}:reset:${user.token_version}`);
});

/* First sign-in: the member becomes Active. */
export const signedIn = safe('signedIn', async (user) => {
  if (user.first_login_at) return;
  const updated = await one(
    'UPDATE users SET first_login_at = now() WHERE id = $1 AND first_login_at IS NULL RETURNING *',
    [user.id]
  );
  if (!updated || INTERNAL_ROLES.includes(updated.role)) return;
  await recordAudit(`${updated.name} signed in for the first time — member active`, updated.id, 'user', updated.id);
  if (updated.created_by) {
    await notify({
      userId: updated.created_by,
      type: 'onboarding',
      title: `${updated.name} has signed in for the first time`,
      body: 'Onboarding: KYC and rules acknowledgement are next.',
    });
  }
});

/* Onboarding is complete when KYC is verified and the rules are
   acknowledged. Called after anything that might have finished it. */
export const checkOnboarding = safe('checkOnboarding', async (userId) => {
  const user = await one(
    `UPDATE users SET onboarding_completed_at = now()
      WHERE id = $1 AND onboarding_completed_at IS NULL
        AND role = ANY($2) AND kyc_status = 'verified' AND rules_ack_at IS NOT NULL
      RETURNING *`,
    [userId, PARTNER_ROLES]
  );
  if (!user) return;
  await recordAudit(`${user.name} completed onboarding`, user.id, 'user', user.id);
  await notify({
    userId: user.id,
    type: 'onboarding',
    title: 'Onboarding complete',
    body: 'You are all set — your full workflow is now open.',
  });
  await notifyInternal(`${user.name} completed onboarding`, `${user.role} partner is ready`);
});

/* KYC sent back: the member has a step to do again, so the reminder cycle
   starts over rather than jumping straight to a Core escalation. */
export const kycRejected = safe('kycRejected', async (userId) => {
  await query(
    `UPDATE users SET onboarding_reminders = 0, onboarding_reminded_at = now(),
            onboarding_escalated_at = NULL
      WHERE id = $1`,
    [userId]
  );
});

/* --------------------------------------------------------------------------
   Realtor Partner
   -------------------------------------------------------------------------- */

export const listingSubmitted = safe('listingSubmitted', async (listing, { resubmitted = false } = {}) => {
  const user = await userById(listing.submitted_by);
  const key = resubmitted ? `${listing.id}:resubmit:${new Date(listing.resubmitted_at).getTime()}` : listing.id;
  await emailMember(user, '04', { listing, resubmitted }, key);
});

export const listingApproved = safe('listingApproved', async (listing) => {
  await emailMember(await userById(listing.submitted_by), '05', { listing }, listing.id);
});

export const listingCorrections = safe('listingCorrections', async (listing, notes) => {
  await emailMember(
    await userById(listing.submitted_by),
    '06',
    { listing, notes },
    `${listing.id}:${new Date(listing.corrections_at).getTime()}`
  );
});

/* A visit with everything its emails mention: the client, the property and
   the partner taking it. */
const VISIT_SELECT = `
  SELECT v.*, l.name AS client_name, l.email AS client_email, li.title AS listing_title,
         u.name AS agent_name, u.phone AS agent_phone
    FROM visits v
    LEFT JOIN leads l ON l.id = v.lead_id
    LEFT JOIN listings li ON li.id = v.listing_id
    LEFT JOIN users u ON u.id = v.assigned_to`;

const visitWithNames = (visitId) => one(`${VISIT_SELECT} WHERE v.id = $1`, [visitId]);
const visitTime = (visit) => new Date(visit.scheduled_at).getTime();

export const visitScheduled = safe('visitScheduled', async (visitId) => {
  const visit = await visitWithNames(visitId);
  if (!visit) return;
  await emailMember(await userById(visit.assigned_to), '07', { visit }, visit.id);
  await emailClient(visit, '01', visit.id);
});

export const visitRescheduled = safe('visitRescheduled', async (visitId) => {
  const visit = await visitWithNames(visitId);
  if (!visit) return;
  await emailMember(await userById(visit.assigned_to), '09', { visit }, `${visit.id}:${visitTime(visit)}`);
  await emailClient(visit, '03', `${visit.id}:${visitTime(visit)}`);
});

export const visitCompleted = safe('visitCompleted', async (visitId) => {
  const visit = await visitWithNames(visitId);
  if (!visit) return;
  await emailMember(await userById(visit.assigned_to), '10', { visit }, visit.id);
  await emailClient(visit, '04', visit.id);
});

/* --------------------------------------------------------------------------
   Creator Partner and Studio — both run on the media pipeline
   -------------------------------------------------------------------------- */

async function mediaWithNames(mediaId) {
  return one(
    `SELECT m.*, p.name AS project_name
       FROM media m LEFT JOIN projects p ON p.id = m.project_id
      WHERE m.id = $1`,
    [mediaId]
  );
}

/* Tell Studio there is work. An item assigned to someone goes to them; an
   open one goes to every active Studio member. */
async function announceProductionTask(media) {
  const assignee = media.claimed_by ? await userById(media.claimed_by) : null;
  if (assignee?.role === 'studio') {
    await emailMember(assignee, '04', { media, assigned: true }, `${media.id}:${assignee.id}`);
    return;
  }
  const studio = await many("SELECT * FROM users WHERE role = 'studio' AND active");
  for (const user of studio) {
    await emailMember(user, '04', { media, assigned: false }, `${media.id}:${user.id}`);
  }
}

/* A media item was created. Depending on who made it and for whom, that is
   a creator assignment (CP-04), a creator's submission (CP-05), and/or new
   work for Studio (ST-04). */
export const mediaCreated = safe('mediaCreated', async (mediaId) => {
  const media = await mediaWithNames(mediaId);
  if (!media) return;
  const owner = await userById(media.uploaded_by);

  if (owner?.role === 'creator' && media.assigned_by) {
    await emailMember(owner, '04', { media }, media.id);
  } else if (owner?.role === 'creator' && media.url) {
    await emailMember(owner, '05', { media, resubmitted: false }, `${media.id}:${media.url}`);
  }

  /* Studio only hears about it once there is footage to work on — or when it
     was handed to a specific editor, who needs to know either way. */
  if (media.url || media.claimed_by) await announceProductionTask(media);
});

/* Footage attached to an item that was waiting for it: the creator's
   submission or resubmission, and Studio's cue to start. */
export const mediaContentAttached = safe('mediaContentAttached', async (mediaId, { resubmitted = false } = {}) => {
  const media = await mediaWithNames(mediaId);
  if (!media) return;
  const owner = await userById(media.uploaded_by);
  if (owner?.role === 'creator') {
    await emailMember(owner, '05', { media, resubmitted }, `${media.id}:${media.url}`);
  }
  if (!resubmitted) await announceProductionTask(media);
});

/* Core sent a creator's raw content back to them. */
export const creatorRevisionRequested = safe('creatorRevisionRequested', async (mediaId, notes) => {
  const media = await mediaWithNames(mediaId);
  if (!media) return;
  await emailMember(await userById(media.uploaded_by), '07', { media, notes }, `${media.id}:${new Date(media.reviewed_at).getTime()}`);
});

export const mediaDelivered = safe('mediaDelivered', async (mediaId) => {
  const media = await mediaWithNames(mediaId);
  if (!media) return;
  await emailMember(await userById(media.edited_by), '06', { media }, `${media.id}:v${media.revision}`);
});

export const mediaReviewed = safe('mediaReviewed', async (mediaId, decision) => {
  const media = await mediaWithNames(mediaId);
  if (!media) return;
  const editors = [...new Set([media.edited_by, media.claimed_by].filter(Boolean))];

  if (decision === 'changes') {
    for (const id of editors) {
      await emailMember(await userById(id), '07', { media }, `${media.id}:v${media.revision}:${id}`);
    }
    return;
  }

  for (const id of editors) {
    const editor = await userById(id);
    await emailMember(editor, '08', { media }, `${media.id}:${id}`);
    await emailMember(editor, '09', { media }, `${media.id}:${id}`);
  }
  await emailMember(await userById(media.uploaded_by), '06', { media }, media.id);
});

/* A lead credited to a piece of content: tell the creator who made it,
   unless they logged the lead themselves. */
export const leadFromContent = safe('leadFromContent', async (lead) => {
  if (!lead.source_media_id) return;
  const media = await mediaWithNames(lead.source_media_id);
  if (!media || !media.uploaded_by || media.uploaded_by === lead.created_by) return;
  const creator = await userById(media.uploaded_by);
  if (creator?.role !== 'creator') return;
  await emailMember(creator, '09', { media, lead }, `${lead.id}:${media.id}`);
});

/* --------------------------------------------------------------------------
   Scheduled steps
   -------------------------------------------------------------------------- */

const DAY = 86_400_000;

/* Reminder 1 -> reminder 2 -> Core team follow-up, each a few days after the
   last. Only members who actually have something to do are chased: someone
   whose KYC is submitted and waiting on Xspace is not reminded about it. */
async function onboardingSweep(now) {
  const gap = config.automations.onboardingReminderDays * DAY;
  const members = await many(
    `SELECT * FROM users
      WHERE role = ANY($1) AND active AND onboarding_completed_at IS NULL
        AND onboarding_escalated_at IS NULL
        AND (kyc_submitted_at IS NULL OR kyc_status = 'rejected' OR rules_ack_at IS NULL)`,
    [PARTNER_ROLES]
  );

  for (const member of members) {
    const since = new Date(member.onboarding_reminded_at || member.created_at).getTime();
    if (now - since < gap) continue;

    /* Claim this step, so two overlapping runs cannot both take it. */
    const claimed = await one(
      `UPDATE users SET onboarding_reminders = onboarding_reminders + 1,
              onboarding_reminded_at = now(),
              onboarding_escalated_at = CASE WHEN onboarding_reminders >= 2 THEN now() END
        WHERE id = $1 AND onboarding_reminders = $2 AND onboarding_escalated_at IS NULL
        RETURNING *`,
      [member.id, member.onboarding_reminders]
    );
    if (!claimed) continue;

    if (member.onboarding_reminders < 2) {
      const reminder = member.onboarding_reminders + 1;
      await emailMember(
        claimed,
        '03',
        { reminder },
        `${member.id}:${reminder}:${since}`
      );
      await recordAudit(`Onboarding reminder ${reminder} sent to ${member.name}`, null, 'user', member.id);
    } else {
      await notifyInternal(
        `Onboarding follow-up needed: ${member.name}`,
        `${member.role} partner still has not finished onboarding after two reminders — please contact them directly.`
      );
      await emailTeam('02', { member: claimed }, member.id);
      await recordAudit(`Onboarding for ${member.name} escalated to Core team`, null, 'user', member.id);
    }
  }
}

/* RP-08: visits in the next 24 hours. Keyed on the visit's time, so a
   rescheduled visit is reminded about again at its new time. */
async function visitReminders() {
  const visits = await many(
    `${VISIT_SELECT}
      WHERE v.status IN ('Scheduled','Rescheduled')
        AND v.scheduled_at > now() AND v.scheduled_at <= now() + interval '24 hours'`
  );
  for (const visit of visits) {
    await emailMember(await userById(visit.assigned_to), '08', { visit }, `${visit.id}:${visitTime(visit)}`);
    await emailClient(visit, '02', `${visit.id}:${visitTime(visit)}`);
  }
}

/* XS-01: 9am India time, what is waiting on the team. */
async function dailyTeamDigest(now) {
  const ist = new Date(now + IST_OFFSET);
  if (ist.getUTCHours() < 9) return;
  const day = ist.toISOString().slice(0, 10);

  const digest = await one(
    `SELECT
       (SELECT COUNT(*) FROM verifications WHERE status IN ('pending','inprogress','escalated'))::int AS listings_pending,
       (SELECT COUNT(*) FROM users WHERE role = ANY($1) AND active AND kyc_status = 'pending'
           AND kyc_submitted_at IS NOT NULL)::int AS kyc_pending,
       (SELECT COUNT(*) FROM media WHERE status = 'delivered')::int AS media_review,
       (SELECT COUNT(*) FROM visits WHERE status IN ('Scheduled','Rescheduled')
           AND (scheduled_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date)::int AS visits_today,
       (SELECT COUNT(*) FROM users WHERE role = ANY($1) AND active
           AND onboarding_completed_at IS NULL)::int AS onboarding_pending,
       (SELECT COUNT(*) FROM users WHERE role = ANY($1) AND active AND onboarding_completed_at IS NULL
           AND onboarding_escalated_at IS NOT NULL)::int AS onboarding_escalated,
       (SELECT COUNT(*) FROM leads WHERE created_at > now() - interval '24 hours')::int AS leads_24h,
       (SELECT COUNT(*) FROM media WHERE status IN ('pending','in_progress','qc','changes_requested')
           AND due_at < now())::int AS media_overdue`,
    [PARTNER_ROLES, day]
  );
  digest.total =
    digest.listings_pending + digest.kyc_pending + digest.media_review + digest.visits_today +
    digest.onboarding_escalated + digest.media_overdue;
  await emailTeam('01', { digest }, day);
}

/* CP-08 / ST-05: work due in the next 24 hours that has not been handed in.
   For a creator that means their content is still missing or being revised;
   for Studio, the cut has not been delivered. */
async function deadlineReminders() {
  const creatorItems = await many(
    `SELECT m.*, p.name AS project_name FROM media m
       JOIN users u ON u.id = m.uploaded_by AND u.role = 'creator'
       LEFT JOIN projects p ON p.id = m.project_id
      WHERE m.status IN ('pending','in_progress','qc','changes_requested')
        AND (m.url IS NULL OR m.blocked_on = 'creator_feedback')
        AND m.due_at > now() AND m.due_at <= now() + interval '24 hours'`
  );
  for (const media of creatorItems) {
    await emailMember(await userById(media.uploaded_by), '08', { media }, `${media.id}:${new Date(media.due_at).getTime()}`);
  }

  const studioItems = await many(
    `SELECT m.*, p.name AS project_name FROM media m
       LEFT JOIN projects p ON p.id = m.project_id
      WHERE m.claimed_by IS NOT NULL
        AND m.status IN ('pending','in_progress','qc','changes_requested')
        AND m.due_at > now() AND m.due_at <= now() + interval '24 hours'`
  );
  for (const media of studioItems) {
    await emailMember(
      await userById(media.claimed_by),
      '05',
      { media },
      `${media.id}:${media.claimed_by}:${new Date(media.due_at).getTime()}`
    );
  }
}

/* CP-10: Monday morning (India time), the past week for every onboarded
   creator who has anything to report. */
const IST_OFFSET = 330 * 60_000;

async function weeklyCreatorSummaries(now) {
  const ist = new Date(now + IST_OFFSET);
  if (ist.getUTCDay() !== 1 || ist.getUTCHours() < 9) return;
  const week = ist.toISOString().slice(0, 10);

  const creators = await many(
    `SELECT u.*,
            (SELECT COUNT(*) FROM media m WHERE m.uploaded_by = u.id
               AND m.created_at > now() - interval '7 days')::int AS submitted,
            (SELECT COUNT(*) FROM media m WHERE m.uploaded_by = u.id AND m.status = 'approved'
               AND m.reviewed_at > now() - interval '7 days')::int AS approved,
            (SELECT COUNT(*) FROM leads l JOIN media m ON m.id = l.source_media_id
              WHERE m.uploaded_by = u.id AND l.created_at > now() - interval '7 days')::int AS leads,
            (SELECT COALESCE(SUM(m.views), 0) FROM media m
              WHERE m.uploaded_by = u.id AND m.status = 'approved')::bigint AS reach,
            (SELECT COUNT(*) FROM media m WHERE m.uploaded_by = u.id
               AND m.status NOT IN ('approved','rejected'))::int AS pending
       FROM users u
      WHERE u.role = 'creator' AND u.active AND u.onboarding_completed_at IS NOT NULL`
  );
  for (const c of creators) {
    if (!c.submitted && !c.approved && !c.leads && !c.pending) continue;
    await emailMember(c, '10', { stats: c }, `${c.id}:${week}`);
  }
}

let running = false;

/* One pass of every scheduled step. Safe to call as often as you like:
   each email is deduplicated, and overlapping calls in this process are
   skipped. */
export async function tick() {
  if (running) return { skipped: true };
  running = true;
  const now = Date.now();
  const results = {};
  try {
    for (const [name, step] of Object.entries({
      onboarding: () => onboardingSweep(now),
      visitReminders,
      deadlineReminders,
      weeklyCreatorSummaries: () => weeklyCreatorSummaries(now),
      dailyTeamDigest: () => dailyTeamDigest(now),
    })) {
      try {
        await step();
        results[name] = 'ok';
      } catch (err) {
        console.error(`[automations] ${name} failed:`, err);
        results[name] = 'failed';
      }
    }
  } finally {
    running = false;
  }
  return results;
}

export function startScheduler() {
  if (!config.automations.enabled) {
    console.log('[automations] scheduler disabled (AUTOMATIONS_ENABLED=false)');
    return;
  }
  const every = 15 * 60_000;
  setTimeout(() => tick(), 60_000).unref();
  setInterval(() => tick(), every).unref();
  console.log(
    `[automations] scheduler on, every 15 min; email ${config.email.resendApiKey ? 'via Resend' : 'logged only (RESEND_API_KEY unset)'}`
  );
}
