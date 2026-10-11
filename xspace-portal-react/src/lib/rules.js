/* The partner rules, by role.

   Plain data so the wording can be changed here without touching the page
   (pages/Rules.jsx). Bump RULES_VERSION when a rule changes materially —
   partners who acknowledged an older version are asked to read it again. */

export const RULES_VERSION = '2026-10-11';

/* Everyone who works with Xspace & Co. */
export const GENERAL_RULES = [
  {
    title: 'Conduct',
    points: [
      'Represent Xspace & Co. honestly. Never promise a price, discount, possession date or approval that has not been confirmed in the portal.',
      'Treat clients, builders and colleagues with respect — in person, on calls and on social media.',
      'Do not share another partner’s leads, listings or content outside the portal.',
    ],
  },
  {
    title: 'Client data & privacy',
    points: [
      'Client names, phone numbers and requirements are confidential. Use them only for the deal they were shared for.',
      'Never add a client to a broadcast list or group without their consent.',
      'Do not take screenshots of the portal or export client details to personal devices or chats.',
    ],
  },
  {
    title: 'Only verified inventory',
    points: [
      'Pitch a property to a client only after it shows as Verified (it is then listed under Projects).',
      'If you learn something that changes a listing — price, availability, a legal issue — update it or tell Core the same day.',
    ],
  },
  {
    title: 'Commissions & payouts',
    points: [
      'Commission is earned on deals that close through the portal, at the rate in your partner agreement.',
      'Payouts are made only to KYC-verified accounts. Keep your Profile & KYC details current.',
      'A deal or lead that was not recorded in the portal cannot be credited later.',
    ],
  },
  {
    title: 'Escalation',
    points: [
      'Raise disputes about lead ownership, commissions or conduct with the Core team first.',
      'Unresolved issues go to the Founder. Decisions are recorded in the portal’s audit log.',
    ],
  },
];

export const ROLE_RULES = {
  realtor: {
    heading: 'Realtor Partner',
    sections: [
      {
        title: 'RERA',
        points: [
          'Real estate agents must be registered with TG RERA before facilitating a sale (RERA Act, Section 9). Add your agent registration number in Profile & KYC.',
          'Quote the project’s RERA registration number whenever you advertise a RERA-registered project.',
        ],
      },
      {
        title: 'Leads & follow-ups',
        points: [
          'A lead assigned to you is yours to work. Log every call, status change and visit in the CRM.',
          'Set a next follow-up on every open lead. Overdue follow-ups are visible to Core.',
          'A lead moves forward or is marked Dropped with a reason — never left idle.',
        ],
      },
      {
        title: 'Site visits',
        points: [
          'Schedule every visit in Site Visits before it happens, and submit feedback the same day.',
          'Confirm the visit with the client and the site the day before.',
        ],
      },
      {
        title: 'Listings',
        points: [
          'Submit inventory with real documents — survey number, approvals and title status. Incomplete listings are not verified.',
          'Never list a property you do not have the owner’s or builder’s authority to sell.',
          'Post what you see changing in your areas under Area Updates.',
        ],
      },
    ],
  },
  creator: {
    heading: 'Creator Partner',
    sections: [
      {
        title: 'Content standards',
        points: [
          'Every piece goes through Studio and is approved by Core or the Founder before it is published as Xspace content.',
          'Show only verified projects. Prices, sizes and amenities in the content must match the listing.',
          'Include the project’s RERA registration number in captions or on screen for RERA-registered projects.',
          'No misleading claims — “guaranteed returns”, “last unit”, fake urgency or edited views.',
        ],
      },
      {
        title: 'Leads from your content',
        points: [
          'Submit every enquiry your content generates through Submit Lead, and pick the content it came from — that is how your leads and earnings are credited.',
          'Do not negotiate price or promise availability to a lead. Hand it to the team through the portal.',
        ],
      },
      {
        title: 'Rights & disclosure',
        points: [
          'Content made with Xspace footage or for Xspace projects may be reused by Xspace & Co. across its channels.',
          'Mark paid or partnership posts as such, as the platform requires.',
          'Record your view counts honestly in My Content.',
        ],
      },
    ],
  },
  studio: {
    heading: 'Xspace Studio',
    sections: [
      {
        title: 'Production',
        points: [
          'Work the queue in order: revisions first, then anything due today, then high priority.',
          'Claim an item before you start it, so nobody edits the same footage twice.',
          'If an item is stuck — no footage, missing project details, waiting on the creator — mark what it is waiting on.',
        ],
      },
      {
        title: 'Quality & approval',
        points: [
          'Check your own cut in Studio QC before submitting it: correct prices, RERA number, spelling, branding and audio.',
          'Approval belongs to Core and the Founder. Never publish or send a cut to a client before it is approved.',
          'When a revision comes back, address every note before resubmitting.',
        ],
      },
      {
        title: 'Files',
        points: [
          'Keep raw footage until the final cut is approved — revisions may need it.',
          'Never share raw or edited files outside the portal before approval.',
        ],
      },
    ],
  },
};
