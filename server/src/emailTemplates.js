import { config } from './config.js';

/* The member emails, by code.

     RP-xx  Realtor Partner     CP-xx  Creator Partner     ST-xx  Xspace Studio
     CL-xx  Clients (buyers)    XS-xx  Founder and Core team

   01–03 are the same moment for every role (welcome, portal access,
   onboarding reminder) worded for that role; the rest follow the role's own
   pipeline. Each template takes a context object and returns a subject, a
   heading, paragraphs and an optional call to action. Anything a person typed
   (names, titles, review notes) is escaped before it reaches the HTML. */

export const ROLE_PREFIX = { realtor: 'RP', creator: 'CP', studio: 'ST' };

const ROLE_TITLE = { realtor: 'Realtor Partner', creator: 'Creator Partner', studio: 'Xspace Studio member' };

/* What each role is responsible for — straight from the role's brief. */
const ROLE_SCOPE = {
  realtor:
    'As a Realtor Partner your responsibility is property listings and site visits. Xspace handles everything else — verification, marketing, content and closing support.',
  creator:
    'As a Creator Partner you bring content, audience and leads. Xspace assigns the projects, reviews your content before it goes out, and tracks the leads it brings in.',
  studio:
    'As an Xspace Studio member you own media production, editing and the content workflow — from raw footage to the approved, published cut.',
};

/* Onboarding steps the member still owes, in plain words. */
function pendingSteps(user) {
  const steps = [];
  if (!user.kyc_submitted_at) steps.push('Submit your KYC and payout details (Profile & KYC)');
  else if (user.kyc_status === 'rejected')
    steps.push(`Fix and resubmit your KYC${user.kyc_note ? ` — ${user.kyc_note}` : ''}`);
  if (!user.rules_ack_at) steps.push('Read and acknowledge the partner rules (Rules)');
  return steps;
}

function when(value) {
  if (!value) return 'to be confirmed';
  return new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const portal = (path = '') => `${config.email.portalUrl}${path}`;

/* --- shared moments, worded per role ------------------------------------ */

const welcome = (role) => ({ user }) => ({
  subject: `Welcome to Xspace, ${user.name}`,
  heading: `Welcome aboard, ${user.name}`,
  paragraphs: [
    `Your application has been approved and you are now an Xspace ${ROLE_TITLE[role]}.`,
    ROLE_SCOPE[role],
    'Your portal sign-in details follow in a separate email.',
  ],
});

const portalAccess = () => ({ user, password }) => ({
  subject: 'Your Xspace portal access',
  heading: 'Your portal is ready',
  paragraphs: [
    'You can now sign in to the Xspace portal on the web or in the Android app.',
    { label: 'Username', value: user.username },
    ...(password ? [{ label: 'Password', value: password }] : []),
    password
      ? 'Change this password from Settings after you first sign in. Never share it — the Xspace team will never ask you for it.'
      : 'Your password will be shared with you directly by the Xspace team.',
    'After signing in, complete your onboarding: submit KYC and payout details, and acknowledge the partner rules.',
  ],
  cta: { label: 'Sign in to the portal', url: portal('/login') },
});

const onboardingReminder = () => ({ user, reminder }) => ({
  subject:
    reminder > 1
      ? 'Reminder: your Xspace onboarding is still pending'
      : 'Finish setting up your Xspace account',
  heading: 'A few steps left',
  paragraphs: [
    `Hi ${user.name}, your onboarding is not complete yet, so your ${ROLE_TITLE[user.role]} workflow is still locked.`,
    { list: pendingSteps(user) },
    reminder > 1
      ? 'If something is stopping you, reply to this email and the Core team will help.'
      : 'It takes about ten minutes.',
  ],
  cta: { label: 'Complete onboarding', url: portal('/profile-kyc') },
});

/* --- the templates ------------------------------------------------------- */

export const TEMPLATES = {
  /* Realtor Partner */
  'RP-01': welcome('realtor'),
  'RP-02': portalAccess('realtor'),
  'RP-03': onboardingReminder('realtor'),
  'RP-04': ({ user, listing, resubmitted }) => ({
    subject: resubmitted
      ? `Listing resubmitted: ${listing.title}`
      : `Listing received: ${listing.title}`,
    heading: resubmitted ? 'Resubmission received' : 'Listing received',
    paragraphs: [
      `Hi ${user.name}, we have received ${resubmitted ? 'your corrected listing' : 'your listing'} "${listing.title}".`,
      'The Xspace team will now verify it — title, approvals, RERA and pricing. You will hear from us when it is approved or if anything needs correcting.',
    ],
    cta: { label: 'View listing', url: portal(`/listings/${listing.id}`) },
  }),
  'RP-05': ({ user, listing }) => ({
    subject: `Listing approved: ${listing.title}`,
    heading: 'Your listing is live',
    paragraphs: [
      `Hi ${user.name}, "${listing.title}" has been verified and is now active on Xspace.`,
      'It can now be offered to clients and booked for site visits.',
    ],
    cta: { label: 'View listing', url: portal(`/listings/${listing.id}`) },
  }),
  'RP-06': ({ user, listing, notes }) => ({
    subject: `Corrections needed: ${listing.title}`,
    heading: 'Your listing needs a few corrections',
    paragraphs: [
      `Hi ${user.name}, the Xspace team reviewed "${listing.title}" and needs the following fixed before it can go live:`,
      { quote: notes },
      'Edit the listing in the portal and save it — that resubmits it for review automatically.',
    ],
    cta: { label: 'Correct the listing', url: portal(`/listings/${listing.id}`) },
  }),
  'RP-07': ({ user, visit }) => ({
    subject: `Site visit scheduled: ${when(visit.scheduled_at)}`,
    heading: 'Site visit scheduled',
    paragraphs: [
      `Hi ${user.name}, a site visit has been scheduled.`,
      { label: 'When', value: when(visit.scheduled_at) },
      ...(visit.listing_title ? [{ label: 'Property', value: visit.listing_title }] : []),
      ...(visit.client_name ? [{ label: 'Client', value: visit.client_name }] : []),
      { label: 'Mode', value: visit.mode || 'On-site' },
    ],
    cta: { label: 'Open site visits', url: portal('/site-visits') },
  }),
  'RP-08': ({ user, visit }) => ({
    subject: `Reminder: site visit ${when(visit.scheduled_at)}`,
    heading: 'Site visit coming up',
    paragraphs: [
      `Hi ${user.name}, this is a reminder of your upcoming site visit.`,
      { label: 'When', value: when(visit.scheduled_at) },
      ...(visit.listing_title ? [{ label: 'Property', value: visit.listing_title }] : []),
      ...(visit.client_name ? [{ label: 'Client', value: visit.client_name }] : []),
      'Please confirm with the client beforehand and mark the visit completed in the portal afterwards.',
    ],
    cta: { label: 'Open site visits', url: portal('/site-visits') },
  }),
  'RP-09': ({ user, visit }) => ({
    subject: `Site visit rescheduled: ${when(visit.scheduled_at)}`,
    heading: 'Site visit rescheduled',
    paragraphs: [
      `Hi ${user.name}, a site visit has been moved.`,
      { label: 'New time', value: when(visit.scheduled_at) },
      ...(visit.listing_title ? [{ label: 'Property', value: visit.listing_title }] : []),
      ...(visit.client_name ? [{ label: 'Client', value: visit.client_name }] : []),
    ],
    cta: { label: 'Open site visits', url: portal('/site-visits') },
  }),
  'RP-10': ({ user, visit }) => ({
    subject: 'Site visit completed — thank you',
    heading: 'Site visit completed',
    paragraphs: [
      `Hi ${user.name}, thank you — the site visit${visit.listing_title ? ` at "${visit.listing_title}"` : ''} on ${when(visit.scheduled_at)} has been recorded as completed.`,
      'Xspace takes the follow-up with the client from here.',
    ],
  }),

  /* Creator Partner */
  'CP-01': welcome('creator'),
  'CP-02': portalAccess('creator'),
  'CP-03': onboardingReminder('creator'),
  'CP-04': ({ user, media }) => ({
    subject: `New content assignment: ${media.title}`,
    heading: 'You have a new assignment',
    paragraphs: [
      `Hi ${user.name}, Xspace has assigned you a piece of content.`,
      { label: 'Brief', value: media.title },
      ...(media.project_name ? [{ label: 'Project', value: media.project_name }] : []),
      { label: 'Format', value: media.kind },
      ...(media.due_at ? [{ label: 'Due', value: when(media.due_at) }] : []),
      ...(media.note ? [{ quote: media.note }] : []),
      'Attach your content to this assignment in the portal when it is ready.',
    ],
    cta: { label: 'Open my content', url: portal('/my-content') },
  }),
  'CP-05': ({ user, media, resubmitted }) => ({
    subject: `${resubmitted ? 'Revision' : 'Content'} received: ${media.title}`,
    heading: resubmitted ? 'Revision received' : 'Content received',
    paragraphs: [
      `Hi ${user.name}, we have received ${resubmitted ? 'your revised' : 'your'} content "${media.title}".`,
      'It is now with Xspace for review and editing. We will let you know when it is approved or if it needs changes.',
    ],
    cta: { label: 'Track it', url: portal('/my-content') },
  }),
  'CP-06': ({ user, media }) => ({
    subject: `Content approved: ${media.title}`,
    heading: 'Approved and ready to publish',
    paragraphs: [
      `Hi ${user.name}, "${media.title}" has been approved.`,
      ...(media.review_notes ? [{ quote: media.review_notes }] : []),
      'Once it is published, record its views in the portal so the leads and reach it brings are credited to you.',
    ],
    cta: { label: 'Open my content', url: portal('/my-content') },
  }),
  'CP-07': ({ user, media, notes }) => ({
    subject: `Revision required: ${media.title}`,
    heading: 'Your content needs a revision',
    paragraphs: [
      `Hi ${user.name}, the Xspace team reviewed "${media.title}" and needs changes:`,
      { quote: notes },
      ...(media.due_at ? [{ label: 'Due', value: when(media.due_at) }] : []),
      'Attach the revised content to the same item in the portal to resubmit it.',
    ],
    cta: { label: 'Open my content', url: portal('/my-content') },
  }),
  'CP-08': ({ user, media }) => ({
    subject: `Due soon: ${media.title}`,
    heading: 'Content deadline approaching',
    paragraphs: [
      `Hi ${user.name}, "${media.title}" is due ${when(media.due_at)}.`,
      'If you are going to miss it, reply to this email so the team can plan around it.',
    ],
    cta: { label: 'Open my content', url: portal('/my-content') },
  }),
  'CP-09': ({ user, media, lead }) => ({
    subject: `New lead from your content: ${media.title}`,
    heading: 'Your content generated a lead',
    paragraphs: [
      `Hi ${user.name}, a new enquiry has been credited to your content "${media.title}".`,
      ...(lead.property_type || lead.preferred_area
        ? [{ label: 'Looking for', value: [lead.configuration, lead.property_type, lead.preferred_area && `in ${lead.preferred_area}`].filter(Boolean).join(' ') }]
        : []),
      'Xspace will follow it up. It counts towards your performance and earnings.',
    ],
    cta: { label: 'See performance', url: portal('/performance') },
  }),
  'CP-10': ({ user, stats }) => ({
    subject: 'Your weekly Xspace performance',
    heading: 'Your week on Xspace',
    paragraphs: [
      `Hi ${user.name}, here is how your content did over the last 7 days.`,
      { label: 'Content submitted', value: String(stats.submitted) },
      { label: 'Content approved', value: String(stats.approved) },
      { label: 'Leads from your content', value: String(stats.leads) },
      { label: 'Total reach (all approved content)', value: Number(stats.reach).toLocaleString('en-IN') },
      ...(stats.pending ? [{ label: 'Still in progress', value: String(stats.pending) }] : []),
    ],
    cta: { label: 'See performance', url: portal('/performance') },
  }),

  /* Xspace Studio */
  'ST-01': welcome('studio'),
  'ST-02': portalAccess('studio'),
  'ST-03': onboardingReminder('studio'),
  'ST-04': ({ user, media, assigned }) => ({
    subject: `New production task: ${media.title}`,
    heading: assigned ? 'A production task is assigned to you' : 'New production task in the queue',
    paragraphs: [
      `Hi ${user.name}, ${assigned ? 'a task has been assigned to you' : 'new work is waiting to be picked up'}.`,
      { label: 'Task', value: media.title },
      ...(media.project_name ? [{ label: 'Project', value: media.project_name }] : []),
      { label: 'Format', value: media.kind },
      { label: 'Priority', value: media.priority === 'high' ? 'High' : 'Normal' },
      ...(media.due_at ? [{ label: 'Due', value: when(media.due_at) }] : []),
      ...(media.note ? [{ quote: media.note }] : []),
    ],
    cta: { label: 'Open pending works', url: portal('/pending-works') },
  }),
  'ST-05': ({ user, media }) => ({
    subject: `Due soon: ${media.title}`,
    heading: 'Task deadline approaching',
    paragraphs: [
      `Hi ${user.name}, "${media.title}" is due ${when(media.due_at)}.`,
      'Deliver the cut for review in the portal when it is ready, or flag what is blocking it.',
    ],
    cta: { label: 'Open pending works', url: portal('/pending-works') },
  }),
  'ST-06': ({ user, media }) => ({
    subject: `Submitted for review: ${media.title}`,
    heading: 'Cut submitted for review',
    paragraphs: [
      `Hi ${user.name}, your cut of "${media.title}" (v${media.revision}) has been sent to the Xspace team for review.`,
      'You will hear back when it is approved or if it needs a revision.',
    ],
  }),
  'ST-07': ({ user, media }) => ({
    subject: `Revision required: ${media.title}`,
    heading: 'Revision required',
    paragraphs: [
      `Hi ${user.name}, v${media.revision} of "${media.title}" needs changes:`,
      { quote: media.review_notes },
      ...(media.due_at ? [{ label: 'Due', value: when(media.due_at) }] : []),
      'It is back in your queue.',
    ],
    cta: { label: 'Open pending works', url: portal('/pending-works') },
  }),
  'ST-08': ({ user, media }) => ({
    subject: `Approved: ${media.title}`,
    heading: 'Your cut was approved',
    paragraphs: [
      `Hi ${user.name}, v${media.revision} of "${media.title}" has been approved.`,
      ...(media.review_notes ? [{ quote: media.review_notes }] : []),
    ],
  }),
  'ST-09': ({ user, media }) => ({
    subject: `Task completed: ${media.title}`,
    heading: 'Task completed',
    paragraphs: [
      `Hi ${user.name}, "${media.title}" is complete and has moved to the media library.`,
      { label: 'Revisions', value: String(media.revision) },
      ...(media.created_at && media.reviewed_at
        ? [{ label: 'Turnaround', value: `${Math.max(1, Math.round((new Date(media.reviewed_at) - new Date(media.created_at)) / 86_400_000))} day(s)` }]
        : []),
    ],
    cta: { label: 'Open the library', url: portal('/media-library') },
  }),
};

/* Clients (buyers). Only sent when the lead has an email address. These go
   to people outside Xspace, so they name no partner and link nowhere inside
   the portal. */
Object.assign(TEMPLATES, {
  'CL-01': ({ client, visit }) => ({
    subject: `Your site visit is confirmed — ${when(visit.scheduled_at)}`,
    heading: 'Site visit confirmed',
    paragraphs: [
      `Hi ${client.name}, thank you for your interest. Your site visit is booked.`,
      { label: 'When', value: when(visit.scheduled_at) },
      ...(visit.listing_title ? [{ label: 'Property', value: visit.listing_title }] : []),
      ...(visit.agent_name ? [{ label: 'Your Xspace partner', value: visit.agent_name }] : []),
      ...(visit.agent_phone ? [{ label: 'Contact', value: visit.agent_phone }] : []),
      'If you need to change the time, just reply to this email.',
    ],
  }),
  'CL-02': ({ client, visit }) => ({
    subject: `Reminder: your site visit ${when(visit.scheduled_at)}`,
    heading: 'See you soon',
    paragraphs: [
      `Hi ${client.name}, a reminder of your upcoming site visit.`,
      { label: 'When', value: when(visit.scheduled_at) },
      ...(visit.listing_title ? [{ label: 'Property', value: visit.listing_title }] : []),
      ...(visit.agent_name ? [{ label: 'Your Xspace partner', value: visit.agent_name }] : []),
      ...(visit.agent_phone ? [{ label: 'Contact', value: visit.agent_phone }] : []),
    ],
  }),
  'CL-03': ({ client, visit }) => ({
    subject: `Your site visit has moved to ${when(visit.scheduled_at)}`,
    heading: 'Site visit rescheduled',
    paragraphs: [
      `Hi ${client.name}, your site visit has been rescheduled.`,
      { label: 'New time', value: when(visit.scheduled_at) },
      ...(visit.listing_title ? [{ label: 'Property', value: visit.listing_title }] : []),
      ...(visit.agent_phone ? [{ label: 'Contact', value: visit.agent_phone }] : []),
    ],
  }),
  'CL-04': ({ client, visit }) => ({
    subject: 'Thank you for visiting',
    heading: 'Thank you for your visit',
    paragraphs: [
      `Hi ${client.name}, thank you for visiting${visit.listing_title ? ` ${visit.listing_title}` : ''}.`,
      'Your Xspace partner will be in touch with next steps. If you have questions in the meantime, reply to this email.',
    ],
  }),

  /* Founder and Core team. */
  'XS-01': ({ user, digest }) => ({
    subject: `Xspace daily digest — ${digest.total} item(s) need attention`,
    heading: 'Today on Xspace',
    paragraphs: [
      `Good morning ${user.name}. Here is what is waiting on the team.`,
      { label: 'Listings awaiting review', value: String(digest.listings_pending) },
      { label: 'KYC submissions awaiting review', value: String(digest.kyc_pending) },
      { label: 'Edited cuts awaiting approval', value: String(digest.media_review) },
      { label: 'Site visits today', value: String(digest.visits_today) },
      { label: 'Partners still onboarding', value: String(digest.onboarding_pending) },
      { label: 'Onboarding escalations open', value: String(digest.onboarding_escalated) },
      { label: 'New leads (last 24 hours)', value: String(digest.leads_24h) },
      { label: 'Overdue Studio tasks', value: String(digest.media_overdue) },
    ],
    cta: { label: 'Open the dashboard', url: portal('/dashboard') },
  }),
  'XS-02': ({ user, member }) => ({
    subject: `Onboarding follow-up needed: ${member.name}`,
    heading: 'A partner needs a personal follow-up',
    paragraphs: [
      `Hi ${user.name}, ${member.name} (${ROLE_TITLE[member.role] || member.role}) has not finished onboarding after two reminders.`,
      { label: 'Email', value: member.email },
      ...(member.phone ? [{ label: 'Phone', value: member.phone }] : []),
      { label: 'Account created', value: when(member.created_at) },
      { label: 'First sign-in', value: member.first_login_at ? when(member.first_login_at) : 'never signed in' },
      { label: 'Still to do', value: pendingSteps(member).join('; ') || '—' },
      'Please contact them directly.',
    ],
    cta: { label: 'Open Teams', url: portal('/teams') },
  }),
});

/* --- rendering ----------------------------------------------------------- */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function blockHtml(p) {
  if (typeof p === 'string') return `<p style="margin:0 0 14px">${esc(p)}</p>`;
  if (p.list) {
    return `<ul style="margin:0 0 14px;padding-left:20px">${p.list
      .map((item) => `<li style="margin:0 0 6px">${esc(item)}</li>`)
      .join('')}</ul>`;
  }
  if ('quote' in p) {
    return `<blockquote style="margin:0 0 14px;padding:10px 14px;border-left:3px solid #c9a227;background:#f7f5ef;white-space:pre-wrap">${esc(p.quote)}</blockquote>`;
  }
  return `<p style="margin:0 0 8px"><span style="color:#6b6b6b">${esc(p.label)}:</span> <strong>${esc(p.value)}</strong></p>`;
}

function blockText(p) {
  if (typeof p === 'string') return p;
  if (p.list) return p.list.map((item) => `  - ${item}`).join('\n');
  if ('quote' in p) return `> ${String(p.quote ?? '').replace(/\n/g, '\n> ')}`;
  return `${p.label}: ${p.value}`;
}

export function renderEmail(code, ctx) {
  const template = TEMPLATES[code];
  if (!template) throw new Error(`Unknown email template ${code}`);
  const { subject, heading, paragraphs, cta } = template(ctx);

  const html = `<!doctype html><html><body style="margin:0;background:#f2f2f2;font-family:Arial,Helvetica,sans-serif;color:#1d1d1d;font-size:15px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="font-weight:bold;letter-spacing:2px;font-size:13px;color:#8a6d00;margin-bottom:12px">XSPACE</div>
  <div style="background:#ffffff;border-radius:8px;padding:24px">
    <h1 style="font-size:20px;margin:0 0 16px">${esc(heading)}</h1>
    ${paragraphs.map(blockHtml).join('\n    ')}
    ${cta ? `<p style="margin:20px 0 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#1d1d1d;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px">${esc(cta.label)}</a></p>` : ''}
  </div>
  <div style="font-size:12px;color:#8a8a8a;margin-top:12px">${esc(code)} · Automated message from Xspace.</div>
</div></body></html>`;

  const text = [
    heading,
    '',
    ...paragraphs.map(blockText),
    ...(cta ? ['', `${cta.label}: ${cta.url}`] : []),
    '',
    `— Xspace (${code})`,
  ].join('\n');

  return { subject, html, text };
}
