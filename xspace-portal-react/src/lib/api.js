/* Client for the Express API in ../../server.

   Base URL: empty by default, because the server serves this bundle from the
   same origin in production. Set VITE_API_URL in a .env file to point the Vite
   dev server at a backend running elsewhere. */

const BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'xspace_token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode — the session just won't survive a reload */
  }
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request(method, path, body) {
  const token = getToken();
  const res = await fetch(BASE + '/api' + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : null;

  /* A 401 means two different things depending on whether we sent a token.
     With one, it expired or was revoked — drop to the login screen. Without
     one, this IS the login attempt, and the server's message ("Invalid email
     or password") is what the user needs to see. */
  if (res.status === 401 && token) {
    setToken(null);
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Your session expired — please sign in again');
  }

  if (!res.ok) {
    throw new ApiError(res.status, payload?.error || `Request failed (${res.status})`);
  }
  return payload;
}

/* Directory endpoints paginate and search: { page, limit, q, status }. */
function qs(opts) {
  const params = new URLSearchParams(
    Object.entries(opts).filter(([, v]) => v !== undefined && v !== '')
  );
  const str = params.toString();
  return str ? '?' + str : '';
}

const get = (p) => request('GET', p);
const post = (p, body) => request('POST', p, body);
const patch = (p, body) => request('PATCH', p, body);
const del = (p) => request('DELETE', p);

export const api = {
  auth: {
    /* A username or an email address — the server matches either. */
    login: async (identifier, password) => {
      const out = await post('/auth/login', { username: identifier, password });
      setToken(out.token);
      return out;
    },
    me: () => get('/auth/me'),
    heartbeat: () => post('/auth/heartbeat'),
    /* Tell the server this session is going away. `keepalive` is what lets the
       request survive the page being closed — a normal fetch is cancelled with
       the document, which is exactly when this most needs to be sent. */
    goOffline: () => {
      const token = getToken();
      if (!token) return Promise.resolve();
      return fetch(BASE + '/api/auth/offline', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        keepalive: true,
      }).catch(() => {});
    },
    logout: async () => {
      await api.auth.goOffline();
      setToken(null);
    },
    /* Changing the password signs out every other session; the server
       hands this one a fresh token so it is not signed out with them. */
    changePassword: async (currentPassword, newPassword) => {
      const out = await post('/auth/change-password', { currentPassword, newPassword });
      if (out?.token) setToken(out.token);
      return out;
    },
  },

  dashboard: {
    snapshot: () => get('/dashboard/snapshot'),
    funnel: () => get('/dashboard/funnel'),
    activity: () => get('/dashboard/activity'),
    audit: () => get('/dashboard/audit'),
    notifications: () => get('/dashboard/notifications'),
    markRead: (id) => post(`/dashboard/notifications/${id}/read`),
    earnings: () => get('/dashboard/earnings'),
    areaUpdates: () => get('/dashboard/area-updates'),
    /* { area, note, category, link } */
    addAreaUpdate: (data) => post('/dashboard/area-updates', data),
    removeAreaUpdate: (id) => del(`/dashboard/area-updates/${id}`),
    markAllRead: () => post('/dashboard/notifications/read-all'),
  },

  leads: {
    list: () => get('/leads'),
    get: (id) => get(`/leads/${id}`),
    create: (data) => post('/leads', data),
    update: (id, data) => patch(`/leads/${id}`, data),
    remove: (id) => del(`/leads/${id}`),
  },

  listings: {
    /* Defaults to the verification queue; { include: 'verified' } for the
       whole book. */
    list: (opts = {}) => get('/listings' + qs(opts)),
    get: (id) => get(`/listings/${id}`),
    create: (data) => post('/listings', data),
    update: (id, data) => patch(`/listings/${id}`, data),
    verify: (id) => post(`/listings/${id}/verify`),
    /* Back to the realtor with what to fix; their next save resubmits it. */
    requestCorrections: (id, notes) => post(`/listings/${id}/corrections`, { notes }),
    remove: (id) => del(`/listings/${id}`),
    photos: (id) => get(`/listings/${id}/photos`),
    addPhoto: (id, dataUrl, caption) => post(`/listings/${id}/photos`, { dataUrl, caption }),
    removePhoto: (id, photoId) => del(`/listings/${id}/photos/${photoId}`),
  },

  projects: {
    list: () => get('/projects'),
    get: (id) => get(`/projects/${id}`),
    create: (data) => post('/projects', data),
    update: (id, data) => patch(`/projects/${id}`, data),
    /* Only an empty project — the server refuses one with listings. */
    remove: (id) => del(`/projects/${id}`),
  },

  visits: {
    list: () => get('/visits'),
    create: (data) => post('/visits', data),
    complete: (id, feedback) => post(`/visits/${id}/complete`, { feedback }),
    unsuccessful: (id, reason) => post(`/visits/${id}/unsuccessful`, { reason }),
    reschedule: (id, scheduledAt) => post(`/visits/${id}/reschedule`, { scheduledAt }),
    /* The assigned realtor or Founder/Core. */
    confirm: (id) => post(`/visits/${id}/confirm`),
    /* Founder/Core only. */
    cancel: (id, reason) => post(`/visits/${id}/cancel`, { reason }),
  },

  verifications: {
    list: (status) => get(`/verifications${status && status !== 'all' ? `?status=${status}` : ''}`),
    start: (id) => post(`/verifications/${id}/start`),
    verify: (id) => post(`/verifications/${id}/verify`),
    escalate: (id, notes) => post(`/verifications/${id}/escalate`, { notes }),
    requestCorrections: (id, notes) => post(`/verifications/${id}/corrections`, { notes }),
    csvUrl: () => BASE + '/api/verifications/export.csv',
  },

  media: {
    upload: (data) => post('/media', data),
    mine: () => get('/media/mine'),
    raw: () => get('/media/raw'),
    library: () => get('/media/library'),
    pending: () => get('/media/pending'),
    /* Every state at once — the Studio dashboard's pipeline. */
    board: () => get('/media/board'),
    /* Due date, priority, blocker, late footage, views. */
    updateMeta: (id, data) => patch(`/media/${id}/meta`, data),
    setStatus: (id, status) => patch(`/media/${id}/status`, { status }),
    /* Studio hands the finished cut back for review. */
    deliver: (id, editedUrl, note) => post(`/media/${id}/deliver`, { editedUrl, note }),
    /* Founder/Core approve it, or send it back carrying the reason. */
    approve: (id, notes) => post(`/media/${id}/review`, { decision: 'approve', notes }),
    requestChanges: (id, notes) => post(`/media/${id}/review`, { decision: 'changes', notes }),
    /* Founder/Core send a creator's raw content back to them. */
    requestRevision: (id, notes) => post(`/media/${id}/request-revision`, { notes }),
  },

  /* One client's journey — outreach, appointments, shortlist, handover.
     Founder/Core only; see server/src/routes/journey.js. */
  journey: {
    get: (leadId) => get(`/journey/${leadId}`),
    startOutreach: (leadId) => post(`/journey/${leadId}/outreach/start`),
    responded: (leadId) => post(`/journey/${leadId}/outreach/responded`),
    stopOutreach: (leadId) => post(`/journey/${leadId}/outreach/stop`),
    /* { scheduledAt, mode, location, meetingLink, purpose } */
    bookAppointment: (leadId, data) => post(`/journey/${leadId}/appointments`, data),
    updateAppointment: (id, data) => patch(`/journey/appointments/${id}`, data),
    addToShortlist: (leadId, listingId, note) => post(`/journey/${leadId}/shortlist`, { listingId, note }),
    removeFromShortlist: (leadId, itemId) => del(`/journey/${leadId}/shortlist/${itemId}`),
    sendShortlist: (leadId) => post(`/journey/${leadId}/shortlist/send`),
    /* { listingId, why, presentationDate, presentedBy } */
    addPresentation: (leadId, data) => post(`/journey/${leadId}/presentations`, data),
    markPresented: (id) => post(`/journey/presentations/${id}/presented`),
    removePresentation: (leadId, id) => del(`/journey/${leadId}/presentations/${id}`),
    /* { happenedAt, kind, notes, outcome, nextAction, nextFollowUpAt } */
    logFollowUp: (leadId, data) => post(`/journey/${leadId}/followups`, data),
    saveNegotiation: (leadId, data) => request('PUT', `/journey/${leadId}/negotiation`, data),
    saveToken: (leadId, data) => request('PUT', `/journey/${leadId}/token`, data),
    closeDeal: (leadId, data) => post(`/journey/${leadId}/deal/close`, data),
    /* Founder only: 'approved' or 'paid'. */
    setCommissionStatus: (leadId, id, status) => post(`/journey/${leadId}/commission/${id}/status`, { status }),
    /* { at, location, instructions, notes } */
    scheduleHandover: (leadId, data) => post(`/journey/${leadId}/handover`, data),
    completeHandover: (leadId) => post(`/journey/${leadId}/handover/complete`),
    /* { name, phone, email, note } — becomes a new lead credited to this one. */
    addReferral: (leadId, data) => post(`/journey/${leadId}/referrals`, data),
  },

  /* A client's own page, from a link in their email — no login. */
  clientPage: {
    get: (token) => get(`/public/c/${token}`),
    respond: (token, data) => post(`/public/c/${token}`, data),
    photoUrl: (path) => BASE + path,
  },

  /* The automated emails: what went out, and running the reminders now. */
  automations: {
    emails: (opts = {}) => get('/automations/emails' + qs(opts)),
    runNow: () => post('/automations/tick'),
  },

  /* Uploads land in the database and come back as a URL that a plain <a>,
     <img> or <video> can fetch — see server/src/routes/files.js. */
  files: {
    upload: (dataUrl, filename) => post('/files', { dataUrl, filename }),
  },

  /* Scoped to what you may open and which rows you may see — server side. */
  search: (q) => get('/search' + qs({ q })),

  users: {
    creators: (opts = {}) => get('/users/creators' + qs(opts)),
    realtors: (opts = {}) => get('/users/realtors' + qs(opts)),
    studios: (opts = {}) => get('/users/studios' + qs(opts)),
    team: () => get('/users/team'),
    /* Website requests to join the team; "Add" is create() with joinRequestId. */
    joinRequests: () => get('/users/join-requests'),
    declineJoin: (id) => post(`/users/join-requests/${id}/decline`),
    partnerDashboards: () => get('/users/partner-dashboards'),
    profile: () => get('/users/me/profile'),
    updateProfile: (data) => patch('/users/me/profile', data),
    /* Partner KYC: submit, and Founder/Core review. */
    submitKyc: (data) => post('/users/me/kyc', data),
    kycQueue: () => get('/users/kyc-queue'),
    reviewKyc: (id, decision, note) => post(`/users/${id}/kyc-review`, { decision, note }),
    ackRules: () => post('/users/me/rules-ack'),
    /* Creates the account and returns the password ONCE, for you to pass on. */
    create: (data) => post('/users', data),
    resetPassword: (id, password) => post(`/users/${id}/reset-password`, { password }),
    update: (id, data) => patch(`/users/${id}`, data),
    /* Permanent — removes the row, not just the active flag. */
    remove: (id) => del(`/users/${id}`),
  },
};

export default api;
