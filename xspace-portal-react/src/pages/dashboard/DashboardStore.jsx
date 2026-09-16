import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';
import { canAccess, normalizeRole } from '../../lib/roleConfig';

/* Everything the portal shows, read from the API.

   This used to be a localStorage blob seeded with demo rows. It now holds
   real records: the signed-in user comes from /auth/me, the KPI strip from
   /dashboard/snapshot (computed in SQL, already scoped to the role), and each
   dataset from its own endpoint. Row scoping is the server's job — a partner
   asking for /leads gets only their own, so nothing here has to filter.

   Datasets are fetched with allSettled and keyed by role access: a Creator has
   no business reading the verification queue, and that 403 must not take the
   whole dashboard down with it. Anything refused or failed stays an empty
   array, and the panel that reads it renders its own empty state. */

const DashboardContext = createContext(null);

const EMPTY = {
  users: [],
  projects: [],
  listings: [],
  leads: [],
  visits: [],
  activity: [],
  notifications: [],
  verifications: [],
  audit: [],
  media: [],
  /* Kept so the panels ported from the original keep rendering; the
     server has no equivalent yet. */
  leadsContributed: [],
  leadInteractions: [],
  listingSubmissions: [],
};

/* Postgres hands back snake_case; the components were written against the
   original demo data's camelCase. Convert once here rather than teaching
   every panel both spellings. */
function camelKey(k) {
  return k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function camelize(value) {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [camelKey(k), camelize(v)])
    );
  }
  return value;
}

export function DashboardProvider({ children }) {
  const [me, setMe] = useState(null);
  const [cards, setCards] = useState([]);
  const [funnel, setFunnel] = useState(null);
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    let user;
    try {
      const out = await api.auth.me();
      user = out.user;
      setMe(camelize(user));
    } catch (err) {
      /* A 401 has already bounced us to /login inside the client. */
      setError(err.message || 'Could not load your account');
      setLoading(false);
      return;
    }

    const role = normalizeRole(user.role);
    const may = (moduleKey) => canAccess(moduleKey, role);

    /* [key, request, allowed] — a request is only sent when the role's own
       matrix says the module is reachable, so the network log stays free of
       predictable 403s. */
    const wanted = [
      ['snapshot', () => api.dashboard.snapshot(), true],
      ['funnel', () => api.dashboard.funnel(), true],
      ['activity', () => api.dashboard.activity(), true],
      ['notifications', () => api.dashboard.notifications(), true],
      ['leads', () => api.leads.list(), may('crm') || may('leadTracker')],
      ['listings', () => api.listings.list(), may('listings')],
      ['projects', () => api.projects.list(), may('projects')],
      ['visits', () => api.visits.list(), may('visits')],
      ['verifications', () => api.verifications.list(), may('verifications')],
      ['audit', () => api.dashboard.audit(), role === 'founder'],
      ['team', () => api.users.team(), may('team')],
      ['media', () => (may('rawMedia') ? api.media.raw() : api.media.mine()), true],
    ];

    const active = wanted.filter(([, , allowed]) => allowed);
    const results = await Promise.allSettled(active.map(([, run]) => run()));

    const next = { ...EMPTY };
    results.forEach((result, i) => {
      const [key] = active[i];
      if (result.status !== 'fulfilled') return;
      const payload = camelize(result.value);

      if (key === 'snapshot') setCards(payload.cards || []);
      else if (key === 'funnel') setFunnel(payload);
      else if (key === 'team') next.users = payload.team || [];
      else next[key] = payload[key] || [];
    });

    setData(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* Panels call this after a write so the numbers come from the database
     rather than from whatever the component guessed locally. */
  const refresh = useCallback(() => load(), [load]);

  const role = normalizeRole(me?.role);
  const userId = me?.id || null;

  const value = useMemo(
    () => ({
      ...data,
      cards,
      funnel,
      role,
      userId,
      currentUser: me,
      loading,
      error,
      refresh,
    }),
    [data, cards, funnel, role, userId, me, loading, error, refresh]
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used inside <DashboardProvider>');
  return ctx;
}
