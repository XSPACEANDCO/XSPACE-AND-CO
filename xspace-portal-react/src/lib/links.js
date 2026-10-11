/* External sites the portal links out to, kept in one place.

   None of these offer an API we are entitled to use, so the portal can only
   open them: the survey number, RERA id or party name still has to be typed
   in on the official site. That is deliberate — the official page is the
   evidence, not a copy of it in our database. */

/* Where a Telangana property is checked before it is verified. Grouped by
   the question each one answers. */
export const GOV_PORTALS = [
  {
    group: 'Approvals & RERA',
    links: [
      {
        label: 'TG RERA — project registry',
        href: 'https://rera.telangana.gov.in/',
        hint: 'RERA number, promoter, approved plan and completion date',
      },
      {
        label: 'HMDA — layout & building approvals',
        href: 'https://www.hmda.gov.in/',
        hint: 'Approved layout / LP number and permits in the HMDA area',
      },
      {
        label: 'GHMC — building permissions & property tax',
        href: 'https://www.ghmc.gov.in/',
        hint: 'Building permit and tax records inside GHMC limits',
      },
      {
        label: 'TS-bPASS — building permission & layout approval',
        href: 'https://tsbpass.telangana.gov.in/',
        hint: 'Single-window permissions issued outside the older systems',
      },
      {
        label: 'DTCP Telangana — town planning',
        href: 'https://dtcp.telangana.gov.in/',
        hint: 'Layout approvals outside HMDA and GHMC limits',
      },
    ],
  },
  {
    group: 'Land & title',
    links: [
      {
        label: 'Bhu Bharati — land records (formerly Dharani)',
        href: 'https://bhubharati.telangana.gov.in/',
        hint: 'Survey number, extent, pattadar and prohibited-land status',
      },
      {
        label: 'IGRS Telangana — registration & stamps',
        href: 'https://registration.telangana.gov.in/',
        hint: 'Encumbrance certificate, registered documents and market value',
      },
      {
        label: 'ISRO Bhuvan — satellite maps',
        href: 'https://bhuvan.nrsc.gov.in/',
        hint: 'Land use, water bodies and boundaries from satellite imagery',
      },
    ],
  },
  {
    group: 'Legal & builder checks',
    links: [
      {
        label: 'eCourts — case status',
        href: 'https://services.ecourts.gov.in/',
        hint: 'Search litigation by party (owner / builder) name',
      },
      {
        label: 'CERSAI — mortgage search',
        href: 'https://www.cersai.org.in/',
        hint: 'Whether the property is pledged to a bank',
      },
      {
        label: 'MCA — company master data',
        href: 'https://www.mca.gov.in/',
        hint: "Builder's company status, directors and filings",
      },
    ],
  },
];

/* Day-to-day tools for the team. */
export const QUICK_TOOLS = [
  {
    group: 'Maps & land',
    links: [
      {
        label: 'Google Earth Pro',
        href: 'https://www.google.com/earth/about/versions/',
        hint: 'Desktop app — historical imagery, measuring plots, KML boundaries',
      },
      {
        label: 'Google Earth (web)',
        href: 'https://earth.google.com/web/',
        hint: 'Quick 3D look at a site from the browser',
      },
      {
        label: 'ISRO Bhuvan',
        href: 'https://bhuvan.nrsc.gov.in/',
        hint: 'Indian satellite maps, land use and water bodies',
      },
      {
        label: 'Google Maps',
        href: 'https://www.google.com/maps',
        hint: 'Directions and travel time for site visits',
      },
    ],
  },
  {
    group: 'Content & social',
    links: [
      { label: 'Canva', href: 'https://www.canva.com/', hint: 'Thumbnails, carousels and price cards' },
      { label: 'CapCut', href: 'https://www.capcut.com/', hint: 'Quick reel edits and captions' },
      { label: 'Meta Business Suite', href: 'https://business.facebook.com/', hint: 'Schedule Instagram and Facebook posts' },
      { label: 'YouTube Studio', href: 'https://studio.youtube.com/', hint: 'Uploads, analytics and comments' },
    ],
  },
  {
    group: 'Files & messaging',
    links: [
      { label: 'Google Drive', href: 'https://drive.google.com/', hint: 'Raw footage and shared brochures' },
      { label: 'WhatsApp Web', href: 'https://web.whatsapp.com/', hint: 'Send brochures and updates to clients' },
    ],
  },
];
