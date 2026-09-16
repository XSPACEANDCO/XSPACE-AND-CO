import { normalizeRole } from './roleConfig';

/* Thin localStorage wrapper. Keys and shapes match the original static demo,
   so an existing browser profile keeps working after the React port. */

export const KEYS = {
  auth: 'xspace_auth',
  role: 'xspace_role',
  userId: 'xspace_user_id',
  theme: 'xspace_theme',
  seed: 'xspace_demo_seed',
  users: 'xspace_users',
  projects: 'xspace_projects',
  listings: 'xspace_listings',
  leads: 'xspace_leads',
  leadsContributed: 'xspace_leads_contributed',
  leadInteractions: 'xspace_lead_interactions',
  visits: 'xspace_visits',
  listingSubmissions: 'xspace_listing_submissions',
  activity: 'xspace_activity',
  notifications: 'xspace_notifications',
  tickets: 'xspace_tickets',
  verifications: 'xspace_verifications',
  audit: 'xspace_audit',
  commissions: 'xspace_commissions',
  studio: 'xspace_studio',
};

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
    /* private mode / blocked storage — demo keeps running in memory */
  }
}

export function removeRaw(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getJSON(key, fallback = []) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function setJSON(key, value) {
  setRaw(key, JSON.stringify(value));
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
