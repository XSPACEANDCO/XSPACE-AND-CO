import { KEYS, getJSON, setJSON, getRaw, setRaw } from './storage';
import { normalizeRole } from './roleConfig';

/* Bump this when the seed shape changes so existing browsers re-seed. v2
   introduced the five-role model (agent -> realtor partner). */
const SEED_VERSION = '2';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/* Seeds the demo datasets exactly once per browser profile, mirroring the
   original dashboard.html seedDemo(). Timestamps stay relative to first run. */
export function seedDemo() {
  if (getRaw(KEYS.seed) === SEED_VERSION) {
    ensureUserIdForRole();
    return;
  }
  setRaw(KEYS.seed, SEED_VERSION);

  setJSON(KEYS.users, [
    { id: 'u1', name: 'Tej (Founder)', email: 'tej@xspace.co', role: 'founder', photo: '', presence: 'online' },
    { id: 'u2', name: 'Karthik (Core)', email: 'karthik@xspace.co', role: 'core', photo: '', presence: 'online' },
    { id: 'u3', name: 'Sai (Realtor Partner)', email: 'sai@xspace.co', role: 'realtor', photo: '', presence: 'away', areas: 'Tellapur, Nallagandla', kyc: 'verified' },
    { id: 'u4', name: 'Priya (Creator Partner)', email: 'priya@xspace.co', role: 'creator', photo: '', presence: 'online', platform: 'Instagram', handle: '@priya.realty', kyc: 'verified' },
    { id: 'u5', name: 'Xspace Studio', email: 'studio@xspace.co', role: 'studio', photo: '', presence: 'online', skill: 'Edit / VR', kyc: 'pending' },
  ]);

  setJSON(KEYS.projects, [
    { id: 'p1', name: 'MyHome Avatar', builder: 'MyHome', rera: 'P02200002975', status: 'Under Construction', units: 500 },
    { id: 'p2', name: 'Vasavi Skyla', builder: 'Vasavi', rera: 'P022000XXXXX', status: 'Ready', units: 120 },
  ]);

  setJSON(KEYS.listings, [
    { id: 'l1', title: '2BHK Tellapur', projectId: 'p1', area: 'Tellapur', price: '1.15 Cr', unitType: '2BHK', status: 'Available', verified: false, assignedAgent: 'u3' },
    { id: 'l2', title: '3BHK Nallagandla', projectId: 'p2', area: 'Nallagandla', price: '1.9 Cr', unitType: '3BHK', status: 'Ready', verified: true, assignedAgent: 'u3' },
  ]);

  setJSON(KEYS.leads, [
    { id: 'c1', name: 'Ramesh', phone: '9000000001', source: 'Instagram', budget: '1.5 Cr', status: 'Discovery', assignedAgent: 'u3', createdAt: Date.now() - HOUR, listingId: 'l1' },
    { id: 'c2', name: 'Sita', phone: '9000000002', source: 'Referral', budget: '2 Cr', status: 'Engaged', assignedAgent: 'u3', createdAt: Date.now() - DAY, listingId: 'l2' },
    { id: 'c3', name: 'Rahul', phone: '9000000003', source: 'Website', budget: '1.1 Cr', status: 'Site Visit', assignedAgent: 'u3', createdAt: Date.now() - 2 * HOUR, listingId: 'l1' },
    { id: 'c4', name: 'Anita', phone: '9000000004', source: 'Referral', budget: '2.5 Cr', status: 'Closed', assignedAgent: 'u3', createdAt: Date.now() - 5 * DAY, listingId: 'l2' },
  ]);

  setJSON(KEYS.leadsContributed, [
    { id: 'lc1', agentId: 'u3', name: 'Network - Reddy', createdAt: Date.now() - 5 * DAY },
    { id: 'lc2', agentId: 'u3', name: 'Friend - Mohan', createdAt: Date.now() - 20 * DAY },
  ]);

  setJSON(KEYS.visits, [
    { id: 'v1', agentId: 'u3', listingId: 'l1', clientId: 'c1', scheduledAt: Date.now() - DAY, endedAt: Date.now() - DAY + HOUR, feedbackSubmittedAt: Date.now() - DAY + HOUR + 10 * 60 * 1000 },
    { id: 'v2', agentId: 'u3', listingId: 'l2', clientId: 'c2', scheduledAt: Date.now() - 2 * DAY, endedAt: Date.now() - 2 * DAY + HOUR, feedbackSubmittedAt: Date.now() - 2 * DAY + HOUR + 45 * 60 * 1000 },
    { id: 'v3', agentId: 'u3', listingId: 'l1', clientId: 'c3', scheduledAt: Date.now() + 6 * HOUR, endedAt: null, feedbackSubmittedAt: null },
  ]);

  setJSON(KEYS.listingSubmissions, [
    { id: 'ls1', agentId: 'u3', listingId: 'l3', title: '2BHK Gated Tellapur', createdAt: Date.now() - 6 * DAY, firstPassApproved: true },
    { id: 'ls2', agentId: 'u3', listingId: 'l4', title: '3BHK Newbuild', createdAt: Date.now() - 10 * DAY, firstPassApproved: false },
  ]);

  setJSON(KEYS.activity, [
    { id: 'a1', text: 'Agent Sai added 2BHK Tellapur', time: Date.now() - HOUR },
    { id: 'a2', text: 'Core Karthik verified project MyHome Avatar', time: Date.now() - 2 * HOUR },
  ]);

  setJSON(KEYS.notifications, [
    { id: 'n1', type: 'approval', title: 'Price change request — 3BHK Nallagandla', body: 'Agent requested -5% price change', role: 'founder', read: false, ts: Date.now() - 400000 },
    { id: 'n2', type: 'lead', title: 'New lead: Ramesh', body: 'Source: Instagram — budget 1.5 Cr', role: 'realtor', read: false, ts: Date.now() - 350000 },
  ]);

  setJSON(KEYS.tickets, [
    { id: 't1', title: 'Price mismatch for 2BHK Tellapur', category: 'listing', priority: 'high', raiser: 'u3', status: 'open', createdAt: Date.now() - 5 * HOUR },
    { id: 't2', title: 'Need RERA docs for MyHome Avatar', category: 'legal', priority: 'medium', raiser: 'u2', status: 'open', createdAt: Date.now() - DAY },
  ]);

  setJSON(KEYS.verifications, [
    { id: 'v1', listingId: 'l1', projectId: 'p1', type: 'Listing', status: 'pending', assignedTo: null, createdAt: Date.now() - 6 * HOUR, startedAt: null, finishedAt: null, notes: 'Price check pending', escalated: false },
    { id: 'v2', listingId: 'l2', projectId: 'p2', type: 'Project', status: 'inprogress', assignedTo: 'u2', createdAt: Date.now() - 12 * HOUR, startedAt: Date.now() - 11 * HOUR, finishedAt: null, notes: 'Verifying RERA', escalated: false },
    { id: 'v3', listingId: 'l2', projectId: 'p2', type: 'Project', status: 'verified', assignedTo: 'u2', createdAt: Date.now() - 48 * HOUR, startedAt: Date.now() - 47 * HOUR, finishedAt: Date.now() - 46 * HOUR, notes: 'OK', escalated: false },
  ]);

  setJSON(KEYS.audit, [
    { id: 'ad1', text: 'Listing l2 marked verified by u2', ts: Date.now() - 6 * HOUR },
    { id: 'ad2', text: 'User u4 created content draft for p1', ts: Date.now() - 12 * HOUR },
  ]);

  setJSON(KEYS.commissions, [
    { agent: 'Sai', agentId: 'u3', pending: '₹45,000', paid: '₹1,20,000' },
    { agent: 'Karthik', agentId: 'u2', pending: '₹10,000', paid: '₹55,000' },
  ]);

  setJSON(KEYS.studio, [
    { id: 's1', title: 'Project p1 — Drone Shoot', status: 'Pending' },
    { id: 's2', title: 'Project p2 — Photography', status: 'In Progress' },
    { id: 's3', title: 'Edit: p1 Walkthrough', status: 'Pending' },
  ]);

  ensureUserIdForRole();
}

/* Keeps xspace_user_id pointing at a user whose role matches the session role. */
export function ensureUserIdForRole() {
  const users = getJSON(KEYS.users);
  if (!Array.isArray(users) || users.length === 0) return null;

  const role = normalizeRole(getRaw(KEYS.role));
  const currentId = getRaw(KEYS.userId);

  if (currentId) {
    const byId = users.find((u) => u.id === currentId);
    if (byId && (byId.role || '').toLowerCase() === role) return byId.id;
  }

  const match = users.find((u) => (u.role || '').toLowerCase() === role);
  if (match) {
    setRaw(KEYS.userId, match.id);
    return match.id;
  }

  const fallback = users[0];
  setRaw(KEYS.userId, fallback.id);
  setRaw(KEYS.role, fallback.role || 'realtor');
  return fallback.id;
}

/* Puts the account that actually signed in into the demo roster.

   The dashboard still reads its people list from localStorage while the pages
   are migrated onto the API, so without this the header greets whichever demo
   user happens to share your role - you sign in as founder@xspace.co and the
   top bar says "Tej (Founder)". Remove it once those panels read from the API. */
export function rememberSessionUser(user) {
  if (!user?.id) return;
  const users = getJSON(KEYS.users);
  const list = Array.isArray(users) ? users : [];
  const i = list.findIndex((u) => u.id === user.id);
  const merged = {
    ...(i >= 0 ? list[i] : {}),
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    presence: 'online',
  };
  if (i >= 0) list[i] = merged;
  else list.push(merged);

  setJSON(KEYS.users, list);
  setRaw(KEYS.userId, user.id);
}
