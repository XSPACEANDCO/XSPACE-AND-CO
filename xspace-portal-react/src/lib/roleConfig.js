/* Xspace Portal access model.

   Five roles across four logins — Founder and Core share one login, the other
   three each have their own. Everything a role can reach is declared in
   MODULES below; nothing else in the app hard-codes a role name.

   NOTE: the spec calls #3 "Area Partner" in places and "Realtor Partner" in
   others — they are the same role, keyed `realtor` here. It replaces the old
   `agent` role; `normalizeRole()` maps saved `agent` sessions onto it. */

export const ROLES = {
  founder: { key: 'founder', label: 'Founder', login: 'Founder & Core Team' },
  core: { key: 'core', label: 'Core Team', login: 'Founder & Core Team' },
  realtor: { key: 'realtor', label: 'Realtor Partner', login: 'Area / Realtor Partner' },
  creator: { key: 'creator', label: 'Creator Partner', login: 'Creator Partner' },
  studio: { key: 'studio', label: 'Xspace Studio', login: 'Xspace Studio' },
};

export const ROLE_KEYS = Object.keys(ROLES);

const ALL_INTERNAL = ['founder', 'core'];

/* The module registry.

   key      stable id, used for permission checks
   label    left-nav text
   to       route it opens (null = no page yet, see ModulePage)
   roles    who may reach it
   scope    what the role sees inside it — 'all' or 'own'
   contents the spec bullets for that module, shown on not-yet-built pages */
export const MODULES = [
  {
    key: 'dashboard',
    label: '🏠 Dashboard',
    to: '/dashboard',
    roles: ['founder', 'core', 'realtor', 'creator', 'studio'],
    scope: { founder: 'all', core: 'all', realtor: 'own', creator: 'own', studio: 'own' },
  },
  /* Every account lives on one screen, split into tabs — Core Team, Realtor,
     Creator and Studio. Founder and Core both get in; who may create or reset
     whom is CAN_CREATE_ROLES below, not this. */
  {
    key: 'team',
    label: '👥 Teams',
    to: '/teams',
    roles: ALL_INTERNAL,
    contents: [
      'Core team directory and permissions',
      'Realtor, creator and studio partner directories',
      'Create accounts and reset passwords',
    ],
  },

  /* ---- Founder & Core: partner data ---- */
  {
    key: 'partnerDashboards',
    label: '📊 Partner Dashboards',
    to: '/partner-dashboards',
    roles: ALL_INTERNAL,
    contents: ['Every partner dashboard in one place', 'Side-by-side performance across creator, realtor and studio'],
  },

  /* ---- Shared operational modules ---- */
  /* One CRM for everybody. There were two entries here — CRM and Lead
     Tracker — both opening /clients, differing only in which rows the server
     returned. That is `scope`, not a second module. */
  {
    key: 'crm',
    label: '👥 CRM',
    to: '/clients',
    roles: [...ALL_INTERNAL, 'realtor', 'creator'],
    scope: { founder: 'all', core: 'all', realtor: 'own', creator: 'own' },
  },
  {
    key: 'leadUploads',
    label: '⬆️ Lead Uploads',
    to: '/lead-uploads',
    roles: ['creator'],
    contents: ['Upload a new lead', 'Bulk upload from a sheet', 'Attribution back to the creator who sourced it'],
  },
  {
    key: 'listings',
    label: '📄 Listings',
    to: '/listings',
    roles: ['founder', 'core', 'realtor'],
    scope: { founder: 'all', core: 'all', realtor: 'own' },
  },
  {
    key: 'projects',
    label: '📁 Projects',
    to: '/projects',
    roles: ['founder', 'core', 'studio', 'creator'],
    scope: { founder: 'all', core: 'all', studio: 'all', creator: 'upcoming' },
    contents: ['Builder data and project info', 'Brochures, UPs and price sheets', 'Legal verification status', 'Creators see new and upcoming listings only'],
  },
  {
    key: 'visits',
    label: '📅 Site Visits',
    to: '/site-visits',
    roles: ['founder', 'core', 'realtor'],
    scope: { founder: 'all', core: 'all', realtor: 'own' },
  },
  {
    key: 'verifications',
    label: '🔍 Live Verifications',
    to: '/verifications',
    roles: ALL_INTERNAL,
    contents: ['Live legal and RERA verification queue', 'Assign, start, escalate and clear', 'Turnaround tracking'],
  },

  /* ---- Media pipeline ---- */
  {
    key: 'mediaUpload',
    label: '📤 Media Upload',
    to: '/media-upload',
    roles: ['creator', 'realtor', 'studio'],
    contents: ['Upload raw reels, shorts and video', 'Goes straight to Studio for edit', 'Editing status visible to the uploader'],
  },
  {
    key: 'rawMedia',
    label: '🎞️ Raw Media Inbox',
    to: '/raw-media',
    roles: ['studio', 'founder', 'core'],
    contents: ['Raw reels and video from creators and realtor partners', 'Claim, edit and publish back', 'Per-item status'],
  },
  {
    key: 'mediaLibrary',
    label: '🗂️ Media Library',
    to: '/media-library',
    roles: ['studio', 'founder', 'core'],
    contents: ['Organised, searchable finished media', 'Tagged by project and partner'],
  },
  {
    key: 'pendingWorks',
    label: '⏳ Pending Works',
    to: '/pending-works',
    roles: ['studio'],
    contents: ['Everything queued for this studio partner', 'Due dates and priority'],
  },
  {
    key: 'quickTools',
    label: '🛠️ Quick Tools',
    to: '/quick-tools',
    roles: ['studio'],
    contents: ['Shortcuts for the studio workflow', 'Bulk status change, export, hand-off'],
  },

  /* ---- Field work (realtor partner) ---- */
  {
    key: 'areaUpdates',
    label: '📍 Area Updates',
    to: '/area-updates',
    roles: ['realtor'],
    contents: ['Keep your area current inside the portal', 'Ground knowledge, new inventory, pricing movement'],
  },

  {
    key: 'rules',
    label: '📘 Rules & Regulations',
    to: '/rules',
    roles: ['realtor', 'creator', 'studio'],
    contents: ['Partner code of conduct', 'Commission and payout rules', 'Escalation policy'],
  },

  /* ---- Org ---- */
  {
    key: 'profileKyc',
    label: '🪪 Profile & KYC',
    to: '/profile-kyc',
    roles: ['realtor', 'creator', 'studio'],
    contents: ['Your profile and contact details', 'KYC documents and verification status', 'Bank details for payouts'],
  },
  {
    key: 'settings',
    label: '⚙️ Settings',
    to: '/settings',
    roles: ['founder', 'core', 'realtor', 'creator', 'studio'],
    contents: ['Account, notification and display preferences'],
  },
];

/* Founder and Core reach everything.
   Mirrors the same construction in server/src/rbac.js, which is the copy that
   actually enforces it — this one only decides what the sidebar paints. They
   run the company: there is no screen they are not entitled to open. Applying
   it here once means a module added later inherits it instead of quietly
   locking them out, which is how they ended up unable to open their own
   profile. Partner rows are untouched. */
for (const m of MODULES) {
  m.roles = [...new Set([...ALL_INTERNAL, ...m.roles])];
  if (m.scope) {
    m.scope.founder = 'all';
    m.scope.core = 'all';
  }
}

const MODULE_BY_KEY = Object.fromEntries(MODULES.map((m) => [m.key, m]));

/* Older sessions (and the original demo) used `agent` for what is now the
   realtor partner, and `admin` for founder. */
export function normalizeRole(role) {
  const r = (role || '').toLowerCase();
  if (r === 'agent') return 'realtor';
  if (r === 'admin') return 'founder';
  return ROLES[r] ? r : 'realtor';
}

export function roleLabel(role) {
  const r = normalizeRole(role);
  return ROLES[r] ? ROLES[r].label : r;
}

export function modulesForRole(role) {
  const r = normalizeRole(role);
  return MODULES.filter((m) => m.roles.includes(r));
}

export function canAccess(moduleKey, role) {
  const m = MODULE_BY_KEY[moduleKey];
  return Boolean(m) && m.roles.includes(normalizeRole(role));
}

export function getModule(moduleKey) {
  return MODULE_BY_KEY[moduleKey];
}

/* 'all' | 'own' | 'upcoming' | undefined — what the role sees inside a module. */
export function scopeFor(moduleKey, role) {
  const m = MODULE_BY_KEY[moduleKey];
  if (!m || !m.scope) return undefined;
  return m.scope[normalizeRole(role)];
}

export function seesEverything(role) {
  const r = normalizeRole(role);
  return r === 'founder' || r === 'core';
}

/* ---- Quick actions, gated the same way ---- */
/* ---- Dashboard panels, per role ---- */
export const PANEL_VISIBILITY = {
  approvalsPanel: ['founder'],
  activityPanel: ['founder', 'core', 'realtor', 'creator', 'studio'],
  pipelinePanel: ['founder', 'core', 'realtor', 'creator'],
  studioPanel: ['founder', 'core', 'studio'],
  teamPanel: ['founder', 'core'],
  projectsSnapshot: ['founder', 'core', 'studio'],
  auditPanel: ['founder'],
  verificationPanel: ['founder', 'core'],
  leadsLegalPanel: ['founder', 'core'],
  realtorPanel: ['realtor'],
  creatorPanel: ['creator'],
  studioWorkPanel: ['studio'],
};

export function canSee(panelId, role) {
  const allowed = PANEL_VISIBILITY[panelId];
  return Array.isArray(allowed) && allowed.includes(normalizeRole(role));
}

/* ---- Route-level access ----
   A route can back more than one module, so a role gets in if ANY module
   mapped to that route allows it. */
export function modulesForRoute(to) {
  return MODULES.filter((m) => m.to === to);
}

export function moduleForRoute(to, role) {
  const r = normalizeRole(role);
  return modulesForRoute(to).find((m) => m.roles.includes(r)) || null;
}

export function canAccessRoute(to, role) {
  return moduleForRoute(to, role) !== null;
}

export const ROUTES = [...new Set(MODULES.filter((m) => m.to).map((m) => m.to))];

/* ---- Who may create whose account ----

   There is no sign-up. The Founder creates Core members; Founder and Core
   create partners; partners create nobody. Mirrors CAN_CREATE_ROLES in
   server/src/rbac.js, which is the authority — this copy only decides which
   options the form offers, and scripts/check-rbac.js fails the build if the
   two drift apart. */
export const CAN_CREATE_ROLES = {
  founder: ['founder', 'core', 'realtor', 'creator', 'studio'],
  core: ['realtor', 'creator', 'studio'],
  realtor: [],
  creator: [],
  studio: [],
};

export function creatableRoles(actorRole) {
  return CAN_CREATE_ROLES[normalizeRole(actorRole)] || [];
}

export function canCreateRole(actorRole, targetRole) {
  return creatableRoles(actorRole).includes(targetRole);
}
