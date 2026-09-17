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

  /* One CRM. It used to be two modules pointing at the same screen — `crm`
     for the internal team and `leadTracker` for partners — so the sidebar
     showed two entries that opened the identical page. The difference was
     never the screen, only which rows the server hands back, and that is
     exactly what `scope` already expresses. */
  crm: {
    roles: [...INTERNAL, 'realtor', 'creator'],
    scope: { founder: 'all', core: 'all', realtor: 'own', creator: 'own' },
  },
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

/* Founder and Core reach everything.

   They run the company: there is no screen they are not entitled to look at,
   and no record they are not allowed to see. Rather than remembering to list
   them on every row above — which is how they ended up locked out of their
   own profile, the lead tracker and the media tools — the rule is applied
   here, once, to the whole registry. A module added later inherits it for
   free.

   Partner rows stay exactly as written: adding Founder and Core to a module
   does not widen it for anybody else. */
for (const m of Object.values(MODULES)) {
  m.roles = [...new Set([...INTERNAL_ROLES, ...m.roles])];
  if (m.scope) {
    m.scope.founder = 'all';
    m.scope.core = 'all';
  }
}

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

/* Same rule as the module registry: Founder and Core may perform every
   action. What they may perform it *on* is still bounded — CAN_CREATE_ROLES
   below keeps the account hierarchy intact, so a Core member having
   `users:write` does not make them able to touch a Founder's account. */
function withInternal(rules) {
  const out = {};
  for (const [action, roles] of Object.entries(rules)) {
    out[action] = [...new Set([...INTERNAL_ROLES, ...roles])];
  }
  return out;
}

/* Writes are narrower than reads in a few places — seeing the verification
   queue is not the same as clearing an item on it. */
export const WRITE_RULES = withInternal({
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
  /* Approving edited media, or sending it back with notes. The editor does
     the work; Founder and Core decide whether it ships. */
  'media:review': INTERNAL,
  'users:write': ['founder'],
  /* Coarse gate on the create/reset endpoints; CAN_CREATE_ROLES decides
     which specific roles each of these may actually create. */
  'users:invite': INTERNAL,
});

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

/* Acting *on* an existing account — editing, deactivating, deleting, resetting
   a password — follows the same hierarchy as creating one.

   Founder and Core can now reach every module, which is what makes this
   necessary rather than incidental: without it, giving Core `users:write`
   would also hand them the ability to delete a Founder. You may administer an
   account whose role you could have created, so Core administers partners and
   only a Founder administers Founders and Core. */
export function canAdminister(actorRole, targetRole) {
  return canCreateRole(actorRole, targetRole);
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
