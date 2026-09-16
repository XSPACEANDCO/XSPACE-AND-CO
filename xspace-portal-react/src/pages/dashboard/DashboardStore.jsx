import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { KEYS, getJSON, setJSON, getRaw, setRaw, removeRaw } from '../../lib/storage';
import { ensureUserIdForRole } from '../../lib/seed';
import { normalizeRole } from '../../lib/roleConfig';

/* Replaces the original's global renderAll(): every dataset lives in React
   state and is mirrored back to localStorage on write, so the demo still
   survives a refresh while the UI updates reactively. */

const DashboardContext = createContext(null);

const DATASETS = {
  users: KEYS.users,
  projects: KEYS.projects,
  listings: KEYS.listings,
  leads: KEYS.leads,
  leadsContributed: KEYS.leadsContributed,
  leadInteractions: KEYS.leadInteractions,
  visits: KEYS.visits,
  listingSubmissions: KEYS.listingSubmissions,
  activity: KEYS.activity,
  notifications: KEYS.notifications,
  tickets: KEYS.tickets,
  verifications: KEYS.verifications,
  audit: KEYS.audit,
  commissions: KEYS.commissions,
  studio: KEYS.studio,
};

function readAll() {
  const out = {};
  for (const [name, key] of Object.entries(DATASETS)) out[name] = getJSON(key, []);
  return out;
}

export function DashboardProvider({ children }) {
  const [data, setData] = useState(() => {
    ensureUserIdForRole();
    return readAll();
  });
  const [role, setRoleState] = useState(() => normalizeRole(getRaw(KEYS.role)));
  const [userId, setUserId] = useState(() => getRaw(KEYS.userId));

  const update = useCallback((name, updater) => {
    setData((prev) => {
      const next = typeof updater === 'function' ? updater(prev[name]) : updater;
      return { ...prev, [name]: next };
    });
  }, []);

  /* Mirror state back to localStorage after each commit, so the demo survives
     a refresh. Kept in an effect rather than inside the state updater so the
     updater stays pure (it runs twice under StrictMode). */
  useEffect(() => {
    for (const [name, key] of Object.entries(DATASETS)) setJSON(key, data[name]);
  }, [data]);

  const currentUser = useMemo(() => {
    const users = data.users;
    if (!users.length) return null;
    const byId = users.find((u) => u.id === userId);
    if (byId) return byId;
    return users.find((u) => (u.role || '').toLowerCase() === role) || users[0];
  }, [data.users, userId, role]);

  const addAudit = useCallback(
    (text) => {
      update('audit', (prev) => [...prev, { id: 'ad' + Date.now(), text, ts: Date.now() }]);
    },
    [update]
  );

  const addNotification = useCallback(
    (notif) => {
      update('notifications', (prev) => [...prev, { id: 'n' + Date.now(), read: false, ts: Date.now(), ...notif }]);
    },
    [update]
  );

  const addTicket = useCallback(
    (ticket) => {
      const full = { id: 't' + Date.now(), status: 'open', raiser: userId, createdAt: Date.now(), ...ticket };
      update('tickets', (prev) => [...prev, full]);
      return full;
    },
    [update, userId]
  );

  /* Switching role also repoints xspace_user_id, which is what kept the
     header, profile modal and lead scoping consistent in the original. */
  const switchRole = useCallback(
    (nextRole) => {
      setRaw(KEYS.role, nextRole);
      const pick = data.users.find((u) => u.role === nextRole) || data.users[0];
      if (pick) {
        setRaw(KEYS.userId, pick.id);
        setUserId(pick.id);
      } else {
        removeRaw(KEYS.userId);
        setUserId(null);
      }
      setRoleState(normalizeRole(nextRole));
    },
    [data.users]
  );

  const value = useMemo(
    () => ({ ...data, role, userId, currentUser, update, addAudit, addNotification, addTicket, switchRole, setUserId }),
    [data, role, userId, currentUser, update, addAudit, addNotification, addTicket, switchRole]
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used inside <DashboardProvider>');
  return ctx;
}
