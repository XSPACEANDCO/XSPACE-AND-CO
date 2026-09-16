import { normalizeRole, seesEverything } from './roleConfig';

/* Pure derivations over the demo datasets. Every function here is a direct
   port of the corresponding render* body in the original dashboard.html,
   re-keyed onto the five-role model. */

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

export const PIPELINE_STAGES = ['Discovery', 'Engaged', 'Site Visit', 'Decision', 'Closed'];

/* Leads the current role is allowed to see. Founder/Core see everything,
   realtor and creator partners only their own, Studio none. */
export function leadsForRole(leads, role, userId) {
  const r = normalizeRole(role);
  if (seesEverything(r)) return leads;
  if (r === 'realtor' || r === 'creator') return leads.filter((l) => l.assignedAgent === userId);
  return [];
}

export function visitsTodayCount(visits, role, userId, onlyForAgent = false) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const end = start + DAY;
  return visits.filter((v) => {
    if (v.scheduledAt >= start && v.scheduledAt < end) {
      if (onlyForAgent && normalizeRole(role) === 'realtor') return v.agentId === userId;
      return true;
    }
    return false;
  }).length;
}

export function snapshotCards({ role: rawRole, userId, leads, listings, projects, tickets, verifications, visits }) {
  const role = normalizeRole(rawRole);
  const scopedLeads = leadsForRole(leads, role, userId);
  const leadsToday = scopedLeads.filter((l) => Date.now() - (l.createdAt || 0) < DAY).length;
  const totalLeads = scopedLeads.length;
  const conversions = scopedLeads.filter((l) => (l.status || '').toLowerCase() === 'closed').length;

  const verifiedToday = verifications.filter(
    (v) => v.status === 'verified' && v.finishedAt && Date.now() - v.finishedAt < DAY
  ).length;

  const finished = verifications.filter((v) => v.startedAt && v.finishedAt);
  let avgHrs = '-';
  if (finished.length) {
    const totalMs = finished.reduce((s, x) => s + (x.finishedAt - x.startedAt), 0);
    avgHrs = Math.round(totalMs / finished.length / HOUR);
    if (Number.isNaN(avgHrs)) avgHrs = '-';
  }

  const pendingVerifications = verifications.filter(
    (v) => v.status === 'pending' || v.status === 'inprogress' || v.status === 'escalated'
  ).length;
  const openTickets = tickets.filter((t) => t.status === 'open').length;

  const activeListings = seesEverything(role)
    ? listings.length
    : listings.filter((li) => li.assignedAgent === userId).length;

  if (role === 'core') {
    return [
      { title: 'Listings Verified Today', num: verifiedToday },
      { title: 'Avg Verification Time (hrs)', num: avgHrs },
      { title: 'Pending Verifications', num: pendingVerifications },
      { title: 'Leads Today', num: leadsToday },
      { title: 'Active Listings', num: activeListings },
      { title: 'Tickets Open', num: openTickets },
    ];
  }

  if (role === 'realtor') {
    return [
      { title: 'Assigned Leads', num: totalLeads },
      { title: 'Visits Today', num: visitsTodayCount(visits, role, userId, true) },
      { title: 'Conversions', num: conversions },
      { title: 'Active Listings', num: activeListings },
    ];
  }

  if (role === 'creator') {
    return [
      { title: 'Leads Uploaded (mo)', num: totalLeads },
      { title: 'Converted', num: conversions },
      { title: 'Raw Media Submitted', num: 3 },
      { title: 'Awaiting Edit', num: 1 },
      { title: 'Commission Pending', num: '₹45,000' },
    ];
  }

  if (role === 'studio') {
    const studioOpen = tickets.filter((t) => t.category === 'media' && t.status === 'open').length;
    return [
      { title: 'Raw Media In', num: 3 },
      { title: 'Edits Pending', num: 2 },
      { title: 'Delivered (week)', num: 4 },
      { title: 'Media Library', num: 24 },
      { title: 'Open Coordination', num: studioOpen },
    ];
  }

  return [
    { title: 'Leads Today', num: leadsToday },
    { title: seesEverything(role) ? 'Leads (visible)' : 'Leads (assigned)', num: totalLeads },
    { title: 'Conversions', num: conversions },
    { title: 'Active Listings', num: activeListings },
    { title: 'Projects Live', num: projects.length },
    { title: 'Visits Today', num: visitsTodayCount(visits, role, userId) },
  ];
}

export function funnelSummary(scopedLeads, rawRole) {
  const role = normalizeRole(rawRole);
  const discovery = scopedLeads.filter((l) => (l.status || '').toLowerCase() === 'discovery').length;
  const engaged = scopedLeads.filter((l) => (l.status || '').toLowerCase() === 'engaged').length;
  const conversion = discovery > 0 ? Math.round((engaged / discovery) * 100) : 0;

  let scopeLabel = 'Leads shown: NONE';
  if (seesEverything(role)) scopeLabel = 'Leads shown: ALL';
  else if (role === 'realtor' || role === 'creator') scopeLabel = 'Leads shown: ASSIGNED';

  return { discovery, engaged, conversion, scopeLabel };
}

export function groupByStage(scopedLeads) {
  return PIPELINE_STAGES.map((stage) => ({
    stage,
    items: scopedLeads.filter((l) => (l.status || 'Discovery').toLowerCase() === stage.toLowerCase()),
  }));
}

export function partnerMetrics({ userId, leads, visits, listings, listingSubmissions, leadsContributed, leadInteractions }) {
  const myVisits = visits.filter((v) => v.agentId === userId);
  const oneWeekAgo = Date.now() - 7 * DAY;

  const visitsCompleted = myVisits.filter((v) => v.endedAt && v.endedAt >= oneWeekAgo).length;

  const myLeads = leads.filter((l) => l.assignedAgent === userId);
  const conversions = myLeads.filter((l) => (l.status || '').toLowerCase() === 'closed').length;

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const contributed = leadsContributed.filter((c) => c.agentId === userId && c.createdAt >= monthStart).length;

  const activeListings = listings.filter(
    (l) => l.assignedAgent === userId && (l.status || '').toLowerCase() !== 'archived'
  ).length;

  const mySubs = listingSubmissions.filter((s) => s.agentId === userId);
  const listingQuality = mySubs.length
    ? Math.round((mySubs.filter((s) => s.firstPassApproved).length / mySubs.length) * 100)
    : 0;

  const withFeedback = myVisits.filter((v) => v.endedAt && v.feedbackSubmittedAt);
  const feedbackVelocity = withFeedback.length
    ? Math.round(
        withFeedback.reduce((s, v) => s + (v.feedbackSubmittedAt - v.endedAt), 0) / withFeedback.length / (60 * 1000)
      ) + 'm'
    : '—';

  const now = Date.now();
  const age0_3 = myLeads.filter((l) => now - (l.createdAt || now) <= 3 * DAY).length;
  const age4_7 = myLeads.filter((l) => {
    const age = now - (l.createdAt || now);
    return age > 3 * DAY && age <= 7 * DAY;
  }).length;
  const age8plus = myLeads.filter((l) => now - (l.createdAt || now) > 7 * DAY).length;

  const cutoff48 = Date.now() - 48 * HOUR;
  const updated = myLeads.filter((l) => {
    if ((l.lastInteractionAt || 0) >= cutoff48) return true;
    return leadInteractions.some((i) => i.leadId === l.id && i.ts >= cutoff48);
  }).length;
  const updateFrequency = myLeads.length ? Math.round((updated / myLeads.length) * 100) : 0;

  const scheduledLast7 = myVisits.filter((v) => v.scheduledAt && v.scheduledAt >= oneWeekAgo).length;
  const completedLast7 = myVisits.filter((v) => v.endedAt && v.endedAt >= oneWeekAgo).length;
  const visitCompliance = scheduledLast7 ? Math.round((completedLast7 / scheduledLast7) * 100) : 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const dayAfterStart = todayStart.getTime() + 2 * DAY;
  const upcomingVisits = myVisits.filter(
    (v) => !v.endedAt && v.scheduledAt && v.scheduledAt >= todayStart.getTime() && v.scheduledAt < dayAfterStart
  );

  return {
    visitsCompleted,
    conversions,
    contributed,
    activeListings,
    listingQuality,
    feedbackVelocity,
    age0_3,
    age4_7,
    age8plus,
    updateFrequency,
    visitCompliance,
    upcomingVisits,
    myLeads,
  };
}

export function filterVerifications(verifications, filter) {
  const items = verifications.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!filter || filter === 'all') return items;
  if (filter === 'escalated') return items.filter((i) => i.escalated === true || i.status === 'escalated');
  return items.filter((i) => i.status === filter);
}

export function leadsAwaitingLegal(leads, listings) {
  return leads.filter((l) => {
    const li = listings.find((x) => x.id === l.listingId);
    return li && li.verified === false;
  });
}

export function verificationsToCsv(verifications) {
  const headers = [
    'id', 'type', 'status', 'listingId', 'projectId', 'assignedTo',
    'createdAt', 'startedAt', 'finishedAt', 'escalated', 'notes',
  ];
  const rows = verifications.map((v) =>
    headers
      .map((h) => {
        const val = v[h];
        if (val === null || val === undefined) return '';
        return String(val).replace(/"/g, '""');
      })
      .map((c) => '"' + c + '"')
      .join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}
