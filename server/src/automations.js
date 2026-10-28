import { config } from './config.js';
import { many, one, query } from './db.js';
import { notify, recordAudit } from './helpers.js';
import { sendEmail } from './mailer.js';
import { renderEmail } from './emailTemplates.js';
import { INTERNAL_ROLES } from './rbac.js';
import * as journey from './clientJourney.js';
import { PROPERTY_TYPES } from './leadStatus.js';

/* The member lifecycle and the three role pipelines, as automations.

     MEMBER APPROVED -> ACCOUNT CREATED -> welcome notification
       -> FIRST LOGIN (member is Active) -> ONBOARDING
            incomplete: reminder 1 -> reminder 2 -> Founder/Core follow-up
            complete:   KYC verified + rules acknowledged -> role workflow

     Realtor  listing submitted -> review -> approved | corrections -> resubmit
              -> visit scheduled -> reminder -> rescheduled -> completed
     Creator  assigned -> submitted -> review -> approved | revision -> resubmit
              -> lead generated -> weekly performance summary
     Studio   task -> deadline reminder -> submitted -> review
              -> approved | revision -> task completed

   Who hears about it, and how:

     Founder, Core and partners   two emails when their account is created —
                                  welcome (EM-01) and portal access (EM-02) —
                                  and everything after that in-app only
     Clients (buyers)             the client journey emails, CL-01..13 —
                                  see src/clientJourney.js

   Most pipeline steps already post their notification from the route that
   performs them (listing approved, media reviewed, and so on). This module
   adds the ones nothing else posts, and the time-based steps — reminders,
   escalation, the weekly summary and the daily digest — which run from
   tick(): every 15 minutes in-process, or on demand through
   POST /api/automations/tick.

   Nothing here is allowed to fail the request that triggered it. Every entry
   point catches and logs. */

const PARTNER_ROLES = ['realtor', 'creator', 'studio'];

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

/* Post a notification once per key. Scheduled steps run repeatedly, so the
   key is what stops "visit tomorrow" being posted every 15 minutes. */
async function notifyOnce(dedupeKey, notification) {
  const claimed = await one(
    'INSERT INTO automation_runs (dedupe_key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING dedupe_key',
    [dedupeKey]
  );
  if (claimed) await notify(notification);
  return Boolean(claimed);
}

async function notifyInternal(title, body = null, type = 'onboarding') {
  for (const role of INTERNAL_ROLES) await notify({ role, type, title, body });
}

export const EMAIL_RE = journey.EMAIL_RE;

function when(value) {
  if (!value) return 'time to be confirmed';
  return new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/* Onboarding steps the member still owes, in plain words. */
function pendingSteps(user) {
  const steps = [];
  if (!user.kyc_submitted_at) steps.push('submit your KYC and payout details (Profile & KYC)');
  else if (user.kyc_status === 'rejected') steps.push('fix and resubmit your KYC');
  if (!user.rules_ack_at) steps.push('accept the terms & conditions (Profile & KYC)');
  return steps;
}

const ROLE_SCOPE = {
  realtor: 'You handle property listings and site visits — Xspace manages everything else.',
  creator: 'You bring content, audience and leads — Xspace assigns projects and reviews your content.',
  studio: 'You own media production and editing — from raw footage to the approved cut.',
};

/* --------------------------------------------------------------------------
   Lifecycle
   -------------------------------------------------------------------------- */

/* Account created: the two emails every new member gets — welcome, then
   their sign-in details — and, for partners, a welcome waiting in their
   notifications at first sign-in. */
export const accountCreated = safe('accountCreated', async (user, password) => {
  for (const code of ['EM-01', 'EM-02']) {
    const { subject, html, text } = renderEmail(code, { user, password });
    await sendEmail({ userId: user.id, to: user.email, code, dedupeKey: `${code}:${user.id}`, subject, html, text });
  }

  if (INTERNAL_ROLES.includes(user.role)) {
    /* The internal team has no onboarding to do. */
    await query('UPDATE users SET onboarding_completed_at = now() WHERE id = $1', [user.id]);
    return;
  }
  await notify({
    userId: user.id,
    type: 'onboarding',
    title: `Welcome to Xspace, ${user.name}`,
    body: `${ROLE_SCOPE[user.role]} To get started, ${pendingSteps(user).join(' and ')}.`,
  });
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
   Realtor Partner and clients — approvals and corrections notify from
   helpers.js; this covers the submission and the site visits.
   -------------------------------------------------------------------------- */

export const listingSubmitted = safe('listingSubmitted', async (listing, { resubmitted = false } = {}) => {
  if (!listing.submitted_by) return;
  await notify({
    userId: listing.submitted_by,
    type: 'verification',
    title: resubmitted ? `Resubmitted: ${listing.title}` : `Listing received: ${listing.title}`,
    body: 'Xspace is reviewing it. You will be told when it is approved or if anything needs correcting.',
  });
});

/* A visit with everything its messages mention: the client, the property and
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
const visitWhat = (visit) =>
  [visit.client_name && `with ${visit.client_name}`, visit.listing_title && `at ${visit.listing_title}`]
    .filter(Boolean)
    .join(' ');

/* actorId: whoever booked it, who does not need telling. */
export const visitScheduled = safe('visitScheduled', async (visitId, actorId) => {
  const visit = await visitWithNames(visitId);
  if (!visit) return;
  if (visit.assigned_to && visit.assigned_to !== actorId) {
    await notify({
      userId: visit.assigned_to,
      type: 'visit',
      title: `Site visit scheduled: ${when(visit.scheduled_at)}`,
      body: visitWhat(visit) || null,
    });
  }
  await journey.visitScheduled(visit.id);
});

export const visitRescheduled = safe('visitRescheduled', async (visitId, actorId) => {
  const visit = await visitWithNames(visitId);
  if (!visit) return;
  if (visit.assigned_to && visit.assigned_to !== actorId) {
    await notify({
      userId: visit.assigned_to,
      type: 'visit',
      title: `Site visit rescheduled to ${when(visit.scheduled_at)}`,
      body: visitWhat(visit) || null,
    });
  }
  await journey.visitScheduled(visit.id, { rescheduled: true });
});

export const visitCompleted = safe('visitCompleted', async (visitId) => {
  await journey.visitCompleted(visitId);
});

/* --------------------------------------------------------------------------
   Creator Partner — assignments, reviews and revisions notify from
   routes/media.js; this covers lead attribution.
   -------------------------------------------------------------------------- */

/* A lead credited to a piece of content: tell the creator who made it,
   unless they logged the lead themselves. The client's name is not theirs
   to see, so only the requirement is mentioned. */
export const leadFromContent = safe('leadFromContent', async (lead) => {
  if (!lead.source_media_id) return;
  const media = await one(
    `SELECT m.id, m.title, m.uploaded_by, u.role FROM media m
       JOIN users u ON u.id = m.uploaded_by WHERE m.id = $1`,
    [lead.source_media_id]
  );
  if (!media || media.role !== 'creator' || media.uploaded_by === lead.created_by) return;
  const type = PROPERTY_TYPES.find((p) => p.key === lead.property_type)?.label;
  const wants = [lead.configuration, type, lead.preferred_area && `in ${lead.preferred_area}`]
    .filter(Boolean)
    .join(' ');
  await notifyOnce(`lead-from-content:${lead.id}:${media.id}`, {
    userId: media.uploaded_by,
    type: 'lead',
    title: `New lead from your content: ${media.title}`,
    body: wants ? `Looking for ${wants}. It counts towards your performance.` : 'It counts towards your performance.',
  });
});

/* --------------------------------------------------------------------------
   Scheduled steps
   -------------------------------------------------------------------------- */

const DAY = 86_400_000;
const IST_OFFSET = 330 * 60_000;

/* Reminder 1 -> reminder 2 -> Founder/Core follow-up, each a few days after
   the last. Only members who actually have something to do are chased:
   someone whose KYC is submitted and waiting on Xspace is not reminded. */
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
      await notify({
        userId: member.id,
        type: 'onboarding',
        title: reminder > 1 ? 'Reminder: your onboarding is still pending' : 'Finish setting up your account',
        body: `Your workflow opens once you ${pendingSteps(member).join(' and ')}.`,
      });
      await recordAudit(`Onboarding reminder ${reminder} sent to ${member.name}`, null, 'user', member.id);
    } else {
      await notifyInternal(
        `Onboarding follow-up needed: ${member.name}`,
        `${member.role} partner has not finished onboarding after two reminders — please contact them directly` +
          `${member.phone ? ` (${member.phone})` : ''}.`
      );
      await recordAudit(`Onboarding for ${member.name} escalated to Core team`, null, 'user', member.id);
    }
  }
}

/* Visits in the next 24 hours: the partner in the app, the client by email.
   Keyed on the visit's time, so a rescheduled visit is reminded about again. */
async function visitReminders() {
  const visits = await many(
    `${VISIT_SELECT}
      WHERE v.status IN ('Scheduled','Confirmed','Rescheduled')
        AND v.scheduled_at > now() AND v.scheduled_at <= now() + interval '24 hours'`
  );
  for (const visit of visits) {
    if (visit.assigned_to) {
      await notifyOnce(`visit-reminder:${visit.id}:${visitTime(visit)}`, {
        userId: visit.assigned_to,
        type: 'visit',
        title: `Reminder: site visit ${when(visit.scheduled_at)}`,
        body: visitWhat(visit) || null,
      });
    }
    await journey.visitReminderEmail(visit.id);
  }
}

/* Work due in the next 24 hours that has not been handed in. For a creator
   that means their content is still missing or being revised; for Studio,
   the cut has not been delivered. */
async function deadlineReminders() {
  const creatorItems = await many(
    `SELECT m.* FROM media m
       JOIN users u ON u.id = m.uploaded_by AND u.role = 'creator'
      WHERE m.status IN ('pending','in_progress','qc','changes_requested')
        AND (m.url IS NULL OR m.blocked_on = 'creator_feedback')
        AND m.due_at > now() AND m.due_at <= now() + interval '24 hours'`
  );
  for (const m of creatorItems) {
    await notifyOnce(`deadline:${m.id}:${m.uploaded_by}:${new Date(m.due_at).getTime()}`, {
      userId: m.uploaded_by,
      type: 'media',
      title: `Due ${when(m.due_at)}: ${m.title}`,
      body: 'Your content for this is still to come.',
    });
  }

  const studioItems = await many(
    `SELECT m.* FROM media m
      WHERE m.claimed_by IS NOT NULL
        AND m.status IN ('pending','in_progress','qc','changes_requested')
        AND m.due_at > now() AND m.due_at <= now() + interval '24 hours'`
  );
  for (const m of studioItems) {
    await notifyOnce(`deadline:${m.id}:${m.claimed_by}:${new Date(m.due_at).getTime()}`, {
      userId: m.claimed_by,
      type: 'media',
      title: `Due ${when(m.due_at)}: ${m.title}`,
      body: 'Deliver the cut for review, or flag what is blocking it.',
    });
  }
}

/* Monday morning (India time): the past week for every onboarded creator who
   has anything to report. */
async function weeklyCreatorSummaries(now) {
  const ist = new Date(now + IST_OFFSET);
  if (ist.getUTCDay() !== 1 || ist.getUTCHours() < 9) return;
  const week = ist.toISOString().slice(0, 10);

  const creators = await many(
    `SELECT u.id,
            (SELECT COUNT(*) FROM media m WHERE m.uploaded_by = u.id
               AND m.created_at > now() - interval '7 days')::int AS submitted,
            (SELECT COUNT(*) FROM media m WHERE m.uploaded_by = u.id AND m.status = 'approved'
               AND m.reviewed_at > now() - interval '7 days')::int AS approved,
            (SELECT COUNT(*) FROM leads l JOIN media m ON m.id = l.source_media_id
              WHERE m.uploaded_by = u.id AND l.created_at > now() - interval '7 days')::int AS leads,
            (SELECT COUNT(*) FROM media m WHERE m.uploaded_by = u.id
               AND m.status NOT IN ('approved','rejected'))::int AS pending
       FROM users u
      WHERE u.role = 'creator' AND u.active AND u.onboarding_completed_at IS NOT NULL`
  );
  for (const c of creators) {
    if (!c.submitted && !c.approved && !c.leads && !c.pending) continue;
    await notifyOnce(`weekly-summary:${c.id}:${week}`, {
      userId: c.id,
      type: 'performance',
      title: 'Your week on Xspace',
      body:
        `Last 7 days: ${c.submitted} submitted, ${c.approved} approved, ${c.leads} lead(s) from your content` +
        `${c.pending ? `; ${c.pending} still in progress` : ''}.`,
    });
  }
}

/* 9am India time: what is waiting on the team, posted to Founder and Core. */
async function dailyTeamDigest(now) {
  const ist = new Date(now + IST_OFFSET);
  if (ist.getUTCHours() < 9) return;
  const day = ist.toISOString().slice(0, 10);

  const d = await one(
    `SELECT
       (SELECT COUNT(*) FROM verifications WHERE status IN ('pending','inprogress','escalated'))::int AS listings,
       (SELECT COUNT(*) FROM users WHERE role = ANY($1) AND active AND kyc_status = 'pending'
           AND kyc_submitted_at IS NOT NULL)::int AS kyc,
       (SELECT COUNT(*) FROM media WHERE status = 'delivered')::int AS cuts,
       (SELECT COUNT(*) FROM visits WHERE status IN ('Scheduled','Confirmed','Rescheduled')
           AND (scheduled_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date)::int AS visits,
       (SELECT COUNT(*) FROM users WHERE role = ANY($1) AND active AND onboarding_completed_at IS NULL
           AND onboarding_escalated_at IS NOT NULL)::int AS escalated,
       (SELECT COUNT(*) FROM leads WHERE created_at > now() - interval '24 hours')::int AS leads,
       (SELECT COUNT(*) FROM media WHERE status IN ('pending','in_progress','qc','changes_requested')
           AND due_at < now())::int AS overdue`,
    [PARTNER_ROLES, day]
  );
  const parts = [
    [d.listings, 'listing(s) to verify'],
    [d.kyc, 'KYC to review'],
    [d.cuts, 'edited cut(s) to approve'],
    [d.visits, 'site visit(s) today'],
    [d.escalated, 'partner(s) needing an onboarding call'],
    [d.overdue, 'overdue Studio task(s)'],
    [d.leads, 'new lead(s) in 24h'],
  ]
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`);

  for (const role of INTERNAL_ROLES) {
    await notifyOnce(`daily-digest:${role}:${day}`, {
      role,
      type: 'digest',
      title: 'Today on Xspace',
      body: parts.length ? parts.join(' · ') : 'Nothing waiting on the team.',
    });
  }
}

let running = false;

/* One pass of every scheduled step. Safe to call as often as you like:
   each notification and email is deduplicated, and overlapping calls in this
   process are skipped. */
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
      clientJourney: async () => {
        const r = await journey.clientTick();
        if (Object.values(r).includes('failed')) throw new Error(JSON.stringify(r));
      },
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
  setTimeout(() => tick(), 60_000).unref();
  setInterval(() => tick(), 15 * 60_000).unref();
  console.log(
    `[automations] scheduler on, every 15 min; email ${config.email.provider ? `via ${config.email.provider}` : 'logged only (no BREVO_API_KEY or RESEND_API_KEY)'}`
  );
}
