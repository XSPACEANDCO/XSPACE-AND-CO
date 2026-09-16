/* AUTHORITATIVE access model.

   The frontend has a mirror of this in src/lib/roleConfig.js, but that copy
   only decides what to paint. This one decides what a request is allowed to
   do, and it is the only one that matters for security. `npm run check:rbac`
   diffs the two and fails if they drift.

   Deliberately dependency-free so the server can deploy on its own. */

export const ROLES = ['founder', 'core', 'realtor', 'creator', 'studio'];

/* Founder and Core are a small, fixed, trusted set — roughly ten people, and
   capped at MAX_INTERNAL_ACCOUNTS. Everyone else is a partner.

   Nobody signs themselves up. Every account is created by a Founder (or a
   Core member, for partners only) who sets the password and passes it on. */
export const INTERNAL_ROLES = ['founder', 'core'];
export const PARTNER_ROLES = ['realtor', 'creator', 'studio'];

/* There is no public sign-up. Nobody creates their own account — a Founder or
   Core member creates it and hands over the credentials. */

export function isInternal(role) {
  return INTERNAL_ROLES.includes(role);
}

const INTERNAL = INTERNAL_ROLES;

/* module key -> { roles, scope }
   scope: 'all'      sees every record
          'own'      sees only records they own or are assigned
          'upcoming' creators: new/upcoming projects only */
export const MODULES = {
  dashboard: { roles: ROLES, scope: { founder: 'all', core: 'all', realtor: 'own', creator: 'own', studio: 'own' } },

  partnerDashboards: { roles: INTERNAL },

  crm: { roles: INTERNAL, scope: { founder: 'all', core: 'all' } },
  leadTracker: { roles: ['realtor', 'creator'], scope: { realtor: 'own', creator: 'own' } },
  leadUploads: { roles: ['creator'] },

  listings: { roles: ['founder', 'core', 'realtor'], scope: { founder: 'all', core: 'all', realtor: 'own' } },
  projects: {
    roles: ['founder', 'core', 'studio', 'creator'],
    scope: { founder: 'all', core: 'all', studio: 'all', creator: 'upcoming' },
  },
  visits: { roles: ['founder', 'core', 'realtor'], scope: { founder: 'all', core: 'all', realtor: 'own' } },
  verifications: { roles: INTERNAL },

  mediaUpload: { roles: ['creator', 'realtor', 'studio'] },
  rawMedia: { roles: ['studio', 'founder', 'core'] },
  mediaLibrary: { roles: ['studio', 'founder', 'core'] },
  pendingWorks: { roles: ['studio'] },
  quickTools: { roles: ['studio'] },

  areaUpdates: { roles: ['realtor'] },

  rules: { roles: ['realtor', 'creator', 'studio'] },

  /* One directory for every account — core team and all three partner kinds.
     Core members read it too, because they look after partners; creating and
     resetting is still gated separately by CAN_CREATE_ROLES. */
  team: { roles: INTERNAL },
  profileKyc: { roles: ['realtor', 'creator', 'studio'] },
  settings: { roles: ROLES },
};

export function canAccess(moduleKey, role) {
  const m = MODULES[moduleKey];
  return Boolean(m) && m.roles.includes(role);
}

export function scopeFor(moduleKey, role) {
  const m = MODULES[moduleKey];
  if (!m || !m.scope) return undefined;
  return m.scope[role];
}

export function seesEverything(role) {
  return role === 'founder' || role === 'core';
}

export function modulesForRole(role) {
  return Object.keys(MODULES).filter((k) => MODULES[k].roles.includes(role));
}

/* Writes are narrower than reads in a few places — seeing the verification
   queue is not the same as clearing an item on it. */
export const WRITE_RULES = {
  'projects:write': INTERNAL,
  'listings:write': ['founder', 'core', 'realtor'],
  'listings:verify': INTERNAL,
  'leads:write': ['founder', 'core', 'realtor', 'creator'],
  'leads:assign': INTERNAL,
  'visits:write': ['founder', 'core', 'realtor'],
  'visits:resolve': INTERNAL,
  'verifications:write': INTERNAL,
  'media:upload': ['creator', 'realtor', 'studio'],
  'media:process': ['studio', 'founder', 'core'],
  'users:write': ['founder'],
  /* Coarse gate on the create/reset endpoints; CAN_CREATE_ROLES decides
     which specific roles each of these may actually create. */
  'users:invite': INTERNAL,
};

/* ---------------------------------------------------------------------------
   Who can create whom.

   The account hierarchy, declared rather than inferred:

     Founder  ->  everyone, including other Founders and Core
     Core     ->  partners only (realtor, creator, studio)
     Partners ->  nobody

   This is also the reset-password rule: you can reset a password for any role
   you could have created. To let a partner role onboard others, add the roles
   it may create to its row here — nothing else needs to change.
   --------------------------------------------------------------------------- */
export const CAN_CREATE_ROLES = {
  founder: ['founder', 'core', 'realtor', 'creator', 'studio'],
  core: ['realtor', 'creator', 'studio'],
  realtor: [],
  creator: [],
  studio: [],
};

export function canCreateRole(actorRole, targetRole) {
  const allowed = CAN_CREATE_ROLES[actorRole];
  return Array.isArray(allowed) && allowed.includes(targetRole);
}

/* Any account creation at all — used to gate the endpoint before the specific
   target role is known. */
export function canCreateAnyone(actorRole) {
  return (CAN_CREATE_ROLES[actorRole] || []).length > 0;
}

export function canDo(action, role) {
  const allowed = WRITE_RULES[action];
  return Array.isArray(allowed) && allowed.includes(role);
}
