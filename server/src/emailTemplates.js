import { config } from './config.js';

/* Every email the portal sends, by code.

     Staff and partners (every role), when their account is created:
       EM-01  welcome                 EM-02  portal access (sign-in details)
     Everything after that reaches them as an in-app notification.

     Clients, about their site visits:
       CL-01  site visit confirmed    CL-03  site visit rescheduled
       CL-02  reminder, day before    CL-04  thank you after the visit
     These go to people outside Xspace, so they name no internal account and
     link nowhere inside the portal.

   Each template takes a context object and returns a subject, a heading,
   paragraphs and an optional call to action. Anything a person typed is
   escaped before it reaches the HTML. */

const ROLE_TITLE = {
  founder: 'Founder',
  core: 'Core Team member',
  realtor: 'Realtor Partner',
  creator: 'Creator Partner',
  studio: 'Xspace Studio member',
};

const ROLE_SCOPE = {
  founder: 'You have full access to every part of the portal.',
  core: 'You run day-to-day operations: verifications, the CRM, partners and the media review.',
  realtor:
    'Your responsibility is property listings and site visits. Xspace handles everything else — verification, marketing, content and closing support.',
  creator:
    'You bring content, audience and leads. Xspace assigns the projects, reviews your content before it goes out, and tracks the leads it brings in.',
  studio:
    'You own media production, editing and the content workflow — from raw footage to the approved, published cut.',
};

const PARTNER = ['realtor', 'creator', 'studio'];

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

export const TEMPLATES = {
  'EM-01': ({ user }) => ({
    subject: `Welcome to Xspace, ${user.name}`,
    heading: `Welcome aboard, ${user.name}`,
    paragraphs: [
      `You have joined Xspace & Co. as a ${ROLE_TITLE[user.role] || user.role}.`,
      ROLE_SCOPE[user.role] || '',
      'Your portal sign-in details follow in a separate email.',
    ].filter(Boolean),
  }),
  'EM-02': ({ user, password }) => ({
    subject: 'Your Xspace portal access',
    heading: 'Your portal is ready',
    paragraphs: [
      'You can now sign in to the Xspace portal on the web or in the Android app.',
      { label: 'Username', value: user.username },
      ...(password ? [{ label: 'Password', value: password }] : []),
      'Change this password from Settings after you first sign in. Never share it — the Xspace team will never ask you for it.',
      ...(PARTNER.includes(user.role)
        ? ['After signing in, complete your onboarding: submit your KYC and payout details, and acknowledge the partner rules. Updates from then on appear in your portal notifications.']
        : []),
    ],
    cta: { label: 'Sign in to the portal', url: `${config.email.portalUrl}/login` },
  }),

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
};

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
