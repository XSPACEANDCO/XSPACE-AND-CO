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
    logout: () => setToken(null),
    changePassword: (currentPassword, newPassword) =>
      post('/auth/change-password', { currentPassword, newPassword }),
  },

  dashboard: {
    snapshot: () => get('/dashboard/snapshot'),
    funnel: () => get('/dashboard/funnel'),
    activity: () => get('/dashboard/activity'),
    audit: () => get('/dashboard/audit'),
    finances: () => get('/dashboard/finances'),
    notifications: () => get('/dashboard/notifications'),
    markRead: (id) => post(`/dashboard/notifications/${id}/read`),
    areaUpdates: () => get('/dashboard/area-updates'),
    addAreaUpdate: (area, note) => post('/dashboard/area-updates', { area, note }),
  },

  leads: {
    list: () => get('/leads'),
    get: (id) => get(`/leads/${id}`),
    create: (data) => post('/leads', data),
    update: (id, data) => patch(`/leads/${id}`, data),
    remove: (id) => del(`/leads/${id}`),
  },

  listings: {
    list: () => get('/listings'),
    get: (id) => get(`/listings/${id}`),
    create: (data) => post('/listings', data),
    update: (id, data) => patch(`/listings/${id}`, data),
    verify: (id) => post(`/listings/${id}/verify`),
  },

  projects: {
    list: () => get('/projects'),
    get: (id) => get(`/projects/${id}`),
    create: (data) => post('/projects', data),
    update: (id, data) => patch(`/projects/${id}`, data),
  },

  visits: {
    list: () => get('/visits'),
    create: (data) => post('/visits', data),
    complete: (id, feedback) => post(`/visits/${id}/complete`, { feedback }),
    unsuccessful: (id, reason) => post(`/visits/${id}/unsuccessful`, { reason }),
    reschedule: (id, scheduledAt) => post(`/visits/${id}/reschedule`, { scheduledAt }),
  },

  verifications: {
    list: (status) => get(`/verifications${status && status !== 'all' ? `?status=${status}` : ''}`),
    start: (id) => post(`/verifications/${id}/start`),
    verify: (id) => post(`/verifications/${id}/verify`),
    escalate: (id, notes) => post(`/verifications/${id}/escalate`, { notes }),
    csvUrl: () => BASE + '/api/verifications/export.csv',
  },

  tickets: {
    list: () => get('/tickets'),
    create: (data) => post('/tickets', data),
    update: (id, data) => patch(`/tickets/${id}`, data),
  },

  commissions: {
    list: () => get('/commissions'),
    create: (data) => post('/commissions', data),
    pay: (id) => post(`/commissions/${id}/pay`),
  },

  media: {
    upload: (data) => post('/media', data),
    mine: () => get('/media/mine'),
    raw: () => get('/media/raw'),
    library: () => get('/media/library'),
    pending: () => get('/media/pending'),
    setStatus: (id, status) => patch(`/media/${id}/status`, { status }),
  },

  users: {
    creators: (opts = {}) => get('/users/creators' + qs(opts)),
    realtors: (opts = {}) => get('/users/realtors' + qs(opts)),
    studios: (opts = {}) => get('/users/studios' + qs(opts)),
    team: () => get('/users/team'),
    partnerDashboards: () => get('/users/partner-dashboards'),
    profile: () => get('/users/me/profile'),
    updateProfile: (data) => patch('/users/me/profile', data),
    /* Creates the account and returns the password ONCE, for you to pass on. */
    create: (data) => post('/users', data),
    resetPassword: (id, password) => post(`/users/${id}/reset-password`, { password }),
    update: (id, data) => patch(`/users/${id}`, data),
  },
};

export default api;
