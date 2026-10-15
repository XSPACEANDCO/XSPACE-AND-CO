import { config } from './config.js';

/* Every email the portal sends, by code.

     Staff and partners (every role), when their account is created:
       EM-01  welcome                 EM-02  portal access (sign-in details)
     Everything after that reaches them as an in-app notification.

     Clients — the client journey (src/clientJourney.js):
       CL-01  cold outreach           CL-08  site visit reminder
       CL-02  outreach follow-up      CL-09  site visit follow-up
       CL-03  final follow-up         CL-10  deal closure
       CL-04  appointment confirmed   CL-11  handover
       CL-05  appointment reminder    CL-12  feedback
       CL-06  shortlisted projects    CL-13  referral
       CL-07  site visit confirmed

   Each template takes a context object and returns a subject, a heading,
   blocks and an optional call to action. Client emails go to people outside
   Xspace: they link only to the client's own pages (/c/<token>), never into
   the portal. Anything a person typed is escaped before it reaches the HTML. */

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

const firstName = (client) => String(client?.name || '').trim().split(/\s+/)[0] || 'there';

/* "Your Xspace contact" — the representative when there is one, otherwise
   the company's own number and reply address. */
function contactBlocks(rep) {
  const phone = rep?.phone || config.email.contactPhone;
  return [
    ...(rep?.name ? [{ label: 'Your Xspace contact', value: rep.name }] : []),
    ...(phone ? [{ label: 'Phone', value: phone }] : []),
    ...(config.email.replyTo ? [{ label: 'Email', value: config.email.replyTo }] : []),
  ];
}

const picked = (projects) =>
  projects.length === 1
    ? 'Our team has researched the market and verified this option for you:'
    : `Our team has researched the market and verified these ${projects.length} options for you:`;

const APPOINTMENT_MODE = { in_person: 'In person', online: 'Online meeting', phone: 'Phone call' };

/* A client's requirement in one line: "3 BHK gated community in Kokapet, ₹1.2 Cr". */
function requirementLine(client) {
  return [
    client.configuration,
    client.property_type_label,
    client.preferred_area && `in ${client.preferred_area}`,
    client.budget && `around ${client.budget}`,
  ]
    .filter(Boolean)
    .join(' ');
}

export const TEMPLATES = {
  /* --- Staff and partners -------------------------------------------- */
  'EM-01': ({ user }) => ({
    subject: `Welcome to Xspace, ${user.name}`,
    heading: `Welcome aboard, ${user.name}`,
    blocks: [
      `You have joined Xspace & Co. as a ${ROLE_TITLE[user.role] || user.role}.`,
      ROLE_SCOPE[user.role] || '',
      'Your portal sign-in details follow in a separate email.',
    ].filter(Boolean),
  }),
  'EM-02': ({ user, password }) => ({
    subject: 'Your Xspace portal access',
    heading: 'Your portal is ready',
    blocks: [
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

  /* --- 1. Client acquisition ------------------------------------------ */
  'CL-01': ({ client, rep }) => ({
    subject: `${firstName(client)}, can we help you find the right property?`,
    heading: `Hello ${firstName(client)}`,
    blocks: [
      `I'm reaching out from Xspace & Co. We help people buy property with confidence — every project we recommend is verified against the official records first, and we stay with you from the first conversation to the day you get the keys.`,
      'Are you currently looking for a home, land or a commercial space — or planning to in the next few months?',
      'If so, simply reply to this email with what you have in mind, and we will set up a short, no-obligation conversation.',
      ...contactBlocks(rep),
    ],
  }),
  'CL-02': ({ client, rep }) => ({
    subject: `Following up, ${firstName(client)}`,
    heading: 'Just following up',
    blocks: [
      `Hi ${firstName(client)}, I wanted to follow up on my earlier note.`,
      'If you are exploring a property — to live in, or as an investment — we can share verified options that match your budget and preferred area, with no obligation.',
      'A one-line reply with what you are looking for is all it takes.',
      ...contactBlocks(rep),
    ],
  }),
  'CL-03': ({ client, rep }) => ({
    subject: 'One last note from Xspace',
    heading: 'One last note',
    blocks: [
      `Hi ${firstName(client)}, I don't want to fill your inbox, so this will be my last email for now.`,
      'If a property requirement comes up later — for you or someone close to you — just reply to this email and we will pick it up from there.',
      'Wishing you the very best.',
      ...contactBlocks(rep),
    ],
  }),

  /* --- 2. Appointment -------------------------------------------------- */
  'CL-04': ({ client, appointment, rep, rescheduled }) => ({
    subject: rescheduled
      ? `Your appointment with Xspace has moved to ${when(appointment.scheduled_at)}`
      : `Your appointment with Xspace — ${when(appointment.scheduled_at)}`,
    heading: rescheduled ? 'Your appointment has been rescheduled' : 'Your appointment is confirmed',
    blocks: [
      `Hi ${firstName(client)}, ${rescheduled ? 'here are the updated details' : 'thank you for making time to speak with us'}.`,
      { label: 'Date & time', value: when(appointment.scheduled_at) },
      { label: 'How', value: APPOINTMENT_MODE[appointment.mode] || appointment.mode },
      ...(appointment.location ? [{ label: 'Where', value: appointment.location }] : []),
      ...(appointment.meeting_link ? [{ label: 'Meeting link', value: appointment.meeting_link }] : []),
      ...(appointment.purpose ? [{ label: 'Purpose', value: appointment.purpose }] : []),
      ...contactBlocks(rep),
      'If the time no longer works, just reply and we will find another.',
    ],
    ...(appointment.meeting_link ? { cta: { label: 'Join the meeting', url: appointment.meeting_link } } : {}),
  }),
  'CL-05': ({ client, appointment, rep }) => ({
    subject: `Reminder: your appointment with Xspace, ${when(appointment.scheduled_at)}`,
    heading: 'See you soon',
    blocks: [
      `Hi ${firstName(client)}, a quick reminder of your appointment with Xspace.`,
      { label: 'Date & time', value: when(appointment.scheduled_at) },
      { label: 'How', value: APPOINTMENT_MODE[appointment.mode] || appointment.mode },
      ...(appointment.location ? [{ label: 'Where', value: appointment.location }] : []),
      ...(appointment.meeting_link ? [{ label: 'Meeting link', value: appointment.meeting_link }] : []),
      ...contactBlocks(rep),
    ],
    ...(appointment.meeting_link ? { cta: { label: 'Join the meeting', url: appointment.meeting_link } } : {}),
  }),

  /* --- 4. Shortlist ------------------------------------------------------ */
  'CL-06': ({ client, projects, pageUrl, rep }) => ({
    subject: `${firstName(client)}, your shortlisted properties from Xspace`,
    heading: 'Your shortlist',
    blocks: [
      `Hi ${firstName(client)}, thank you for walking us through what you need.`,
      ...(requirementLine(client)
        ? [`You told us you are looking for ${requirementLine(client)}. ${picked(projects)}`]
        : [picked(projects)]),
      ...projects.map((p) => ({ card: p })),
      'Open your shortlist to see the photos and brochures, and tap "I\'m interested" on any you would like to visit — we will arrange the site visit.',
      ...contactBlocks(rep),
    ],
    cta: { label: 'View your shortlist', url: pageUrl },
  }),

  /* --- 5. Site visit ----------------------------------------------------- */
  'CL-07': ({ client, visit, rep, rescheduled }) => ({
    subject: rescheduled
      ? `Your site visit has moved to ${when(visit.scheduled_at)}`
      : `Site visit confirmed — ${visit.listing_title || 'Xspace'}, ${when(visit.scheduled_at)}`,
    heading: rescheduled ? 'Your site visit has been rescheduled' : 'Your site visit is confirmed',
    blocks: [
      `Hi ${firstName(client)}, ${rescheduled ? 'here are the updated details for your visit' : 'your site visit is booked'}.`,
      ...(visit.listing_title ? [{ label: 'Project', value: visit.listing_title }] : []),
      ...(visit.address ? [{ label: 'Address', value: visit.address }] : []),
      { label: 'Date & time', value: when(visit.scheduled_at) },
      ...(visit.meeting_point ? [{ label: 'Meeting point', value: visit.meeting_point }] : []),
      ...contactBlocks(rep),
      ...(visit.realtor_name
        ? [{ label: 'Realtor partner', value: `${visit.realtor_name}${visit.realtor_phone ? ` — ${visit.realtor_phone}` : ''}` }]
        : []),
    ],
    ...(visit.map_link ? { cta: { label: 'Open in Maps', url: visit.map_link } } : {}),
  }),
  'CL-08': ({ client, visit, rep }) => ({
    subject: `Reminder: site visit ${when(visit.scheduled_at)}`,
    heading: 'Your site visit is coming up',
    blocks: [
      `Hi ${firstName(client)}, a reminder of your site visit.`,
      ...(visit.listing_title ? [{ label: 'Project', value: visit.listing_title }] : []),
      ...(visit.address ? [{ label: 'Address', value: visit.address }] : []),
      { label: 'Date & time', value: when(visit.scheduled_at) },
      ...(visit.meeting_point ? [{ label: 'Meeting point', value: visit.meeting_point }] : []),
      ...contactBlocks(rep),
      ...(visit.realtor_name
        ? [{ label: 'Realtor partner', value: `${visit.realtor_name}${visit.realtor_phone ? ` — ${visit.realtor_phone}` : ''}` }]
        : []),
    ],
    ...(visit.map_link ? { cta: { label: 'Open in Maps', url: visit.map_link } } : {}),
  }),

  /* --- 6. After the visit ------------------------------------------------ */
  'CL-09': ({ client, visit, answerUrl, rep }) => ({
    subject: `How was your visit${visit.listing_title ? ` to ${visit.listing_title}` : ''}?`,
    heading: 'How did you find it?',
    blocks: [
      `Hi ${firstName(client)}, thank you for visiting${visit.listing_title ? ` ${visit.listing_title}` : ''}. We would love to know what you thought — it tells us how to help you next.`,
      {
        buttons: [
          { label: 'I liked it — next steps', url: `${answerUrl}?answer=interested` },
          { label: 'Not sure yet', url: `${answerUrl}?answer=not_sure` },
          { label: 'Show me other options', url: `${answerUrl}?answer=not_interested` },
        ],
      },
      'Or simply reply to this email. Either way, we will keep looking after you.',
      ...contactBlocks(rep),
    ],
  }),

  /* --- 7–8. Deal and handover --------------------------------------------- */
  'CL-10': ({ client, property, rep }) => ({
    subject: `Congratulations, ${firstName(client)}!`,
    heading: 'Congratulations on your new property',
    blocks: [
      `Hi ${firstName(client)}, congratulations — your deal${property ? ` for ${property}` : ''} is now confirmed with Xspace & Co.`,
      'What happens next:',
      {
        list: [
          'Our team will take you through the agreement and payment schedule.',
          'We coordinate the documentation and registration with the developer or seller.',
          'We will confirm your handover date as soon as it is fixed.',
        ],
      },
      'Whatever you need along the way, we are here.',
      ...contactBlocks(rep),
    ],
  }),
  'CL-11': ({ client, property, handover, rep, rescheduled }) => ({
    subject: `${rescheduled ? 'Updated: ' : ''}Your handover — ${when(handover.at)}`,
    heading: rescheduled ? 'Your handover has been rescheduled' : 'Your handover is scheduled',
    blocks: [
      `Hi ${firstName(client)}, the day is nearly here.`,
      ...(property ? [{ label: 'Property', value: property }] : []),
      { label: 'Date & time', value: when(handover.at) },
      ...(handover.location ? [{ label: 'Location', value: handover.location }] : []),
      ...(handover.instructions
        ? ['Please bring / note:', { quote: handover.instructions }]
        : []),
      ...contactBlocks(rep),
      'After the handover, we will check in to make sure everything is as it should be.',
    ],
  }),

  /* --- 9–10. Feedback and referral ---------------------------------------- */
  'CL-12': ({ client, feedbackUrl }) => ({
    subject: `${firstName(client)}, how did we do?`,
    heading: 'How did we do?',
    blocks: [
      `Hi ${firstName(client)}, we hope you are settling in well. Could you take a minute to tell us how Xspace looked after you?`,
      'Overall, how would you rate your experience?',
      {
        buttons: [1, 2, 3, 4, 5].map((n) => ({ label: `${n} ★`, url: `${feedbackUrl}?overall=${n}` })),
      },
      'It takes under a minute, and it genuinely shapes how we work.',
    ],
  }),
  'CL-13': ({ client, referralUrl }) => ({
    subject: 'Know someone looking for a property?',
    heading: 'Thank you — and a small request',
    blocks: [
      `Hi ${firstName(client)}, thank you for your kind feedback. It means a lot to the whole team.`,
      'If a friend, family member or colleague is looking to buy a home, land or a commercial space, we would be grateful for an introduction. We will look after them the way we looked after you.',
    ],
    cta: { label: 'Introduce someone', url: referralUrl },
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

const BUTTON = 'display:inline-block;background:#1d1d1d;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px';
const BUTTON_LIGHT = 'display:inline-block;background:#ffffff;color:#1d1d1d;text-decoration:none;padding:9px 14px;border-radius:6px;border:1px solid #c9c9c9;margin:0 6px 8px 0';

/* A shortlisted project: { image, title, subtitle, lines[], links[{label,url}] } */
function cardHtml(c) {
  return `<div style="border:1px solid #e3e3e3;border-radius:8px;overflow:hidden;margin:0 0 14px">
      ${c.image ? `<img src="${esc(c.image)}" alt="${esc(c.title)}" width="510" style="display:block;width:100%;max-width:510px;height:auto;border:0">` : ''}
      <div style="padding:12px 14px">
        <div style="font-size:16px;font-weight:bold">${esc(c.title)}</div>
        ${c.subtitle ? `<div style="color:#6b6b6b;font-size:13px;margin:2px 0 8px">${esc(c.subtitle)}</div>` : ''}
        ${(c.lines || []).map((l) => `<div style="font-size:14px;margin:0 0 4px">${esc(l)}</div>`).join('')}
        ${(c.links || []).length ? `<div style="margin-top:8px;font-size:14px">${c.links.map((l) => `<a href="${esc(l.url)}" style="color:#8a6d00;margin-right:14px">${esc(l.label)}</a>`).join('')}</div>` : ''}
      </div>
    </div>`;
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
  if (p.card) return cardHtml(p.card);
  if (p.buttons) {
    return `<p style="margin:0 0 8px">${p.buttons.map((b) => `<a href="${esc(b.url)}" style="${BUTTON_LIGHT}">${esc(b.label)}</a>`).join('')}</p>`;
  }
  return `<p style="margin:0 0 8px"><span style="color:#6b6b6b">${esc(p.label)}:</span> <strong>${esc(p.value)}</strong></p>`;
}

function blockText(p) {
  if (typeof p === 'string') return p;
  if (p.list) return p.list.map((item) => `  - ${item}`).join('\n');
  if ('quote' in p) return `> ${String(p.quote ?? '').replace(/\n/g, '\n> ')}`;
  if (p.card) {
    const c = p.card;
    return [`* ${c.title}`, c.subtitle, ...(c.lines || []), ...(c.links || []).map((l) => `${l.label}: ${l.url}`)]
      .filter(Boolean)
      .join('\n  ');
  }
  if (p.buttons) return p.buttons.map((b) => `${b.label}: ${b.url}`).join('\n');
  return `${p.label}: ${p.value}`;
}

/* ctx.unsubscribeUrl, when given, adds the opt-out link every client email
   carries. */
export function renderEmail(code, ctx) {
  const template = TEMPLATES[code];
  if (!template) throw new Error(`Unknown email template ${code}`);
  const { subject, heading, blocks, cta } = template(ctx);
  const unsub = ctx.unsubscribeUrl;

  const html = `<!doctype html><html><body style="margin:0;background:#f2f2f2;font-family:Arial,Helvetica,sans-serif;color:#1d1d1d;font-size:15px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="font-weight:bold;letter-spacing:2px;font-size:13px;color:#8a6d00;margin-bottom:12px">XSPACE &amp; CO.</div>
  <div style="background:#ffffff;border-radius:8px;padding:24px">
    <h1 style="font-size:20px;margin:0 0 16px">${esc(heading)}</h1>
    ${blocks.map(blockHtml).join('\n    ')}
    ${cta ? `<p style="margin:20px 0 0"><a href="${esc(cta.url)}" style="${BUTTON}">${esc(cta.label)}</a></p>` : ''}
  </div>
  <div style="font-size:12px;color:#8a8a8a;margin-top:12px">Xspace &amp; Co.${unsub ? ` · <a href="${esc(unsub)}" style="color:#8a8a8a">Unsubscribe from these emails</a>` : ''}</div>
</div></body></html>`;

  const text = [
    heading,
    '',
    ...blocks.map(blockText),
    ...(cta ? ['', `${cta.label}: ${cta.url}`] : []),
    '',
    '— Xspace & Co.',
    ...(unsub ? [`Unsubscribe: ${unsub}`] : []),
  ].join('\n');

  return { subject, html, text };
}
