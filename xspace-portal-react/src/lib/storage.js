import { normalizeRole } from './roleConfig';

/* Session state kept in the browser.

   This used to hold the whole portal: a seeded blob of fake users, projects,
   listings, leads, visits, tickets and commissions that every page read from.
   That is why the site showed "MyHome Avatar" and "Ramesh" to everyone on
   every device — it was generated in the browser, not stored in the database.

   All of that now lives in Postgres and arrives through lib/api.js. What is
   left here is only what genuinely belongs to this browser: who is signed in
   and which theme they chose. */

export const KEYS = {
  auth: 'xspace_auth',
  role: 'xspace_role',
  userId: 'xspace_user_id',
  theme: 'xspace_theme',
};

/* The demo blob is still sitting in the localStorage of every browser and
   phone that has opened the portal before today, and nothing would ever
   overwrite it. Clearing it on boot is what actually makes the fake rows
   disappear from devices already out there. */
const RETIRED_KEYS = [
  'xspace_demo_seed',
  'xspace_users',
  'xspace_projects',
  'xspace_listings',
  'xspace_leads',
  'xspace_leads_contributed',
  'xspace_lead_interactions',
  'xspace_visits',
  'xspace_listing_submissions',
  'xspace_activity',
  'xspace_notifications',
  'xspace_tickets',
  'xspace_verifications',
  'xspace_audit',
  'xspace_commissions',
  'xspace_studio',
];

export function purgeDemoData() {
  for (const key of RETIRED_KEYS) removeRaw(key);
}

export function getRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setRaw(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / blocked storage — the session just won't survive a reload */
  }
}

export function removeRaw(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function isAuthed() {
  return getRaw(KEYS.auth) === '1';
}

export function getRole() {
  return normalizeRole(getRaw(KEYS.role));
}

export function getCurrentUserId() {
  return getRaw(KEYS.userId);
}
