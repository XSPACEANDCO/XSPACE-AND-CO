import { bearerFrom, verifyToken } from './auth.js';
import { canAccess, canDo, scopeFor, seesEverything } from './rbac.js';
import { one } from './db.js';

/* Populates req.user from the bearer token. 401 if absent or invalid.

   The role is re-read from the database rather than trusted from the token, so
   revoking or changing someone's role takes effect on their next request
   instead of whenever their token happens to expire. */
export async function requireAuth(req, res, next) {
  const token = bearerFrom(req);
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });

  const user = await one('SELECT id, name, email, role, active FROM users WHERE id = $1', [
    payload.sub,
  ]);
  if (!user) return res.status(401).json({ error: 'User no longer exists' });
  if (!user.active) return res.status(403).json({ error: 'Account is deactivated' });

  req.user = user;
  next();
}

/* Gate a route on a module from the access matrix. */
export function requireModule(moduleKey) {
  return (req, res, next) => {
    if (!canAccess(moduleKey, req.user.role)) {
      return res.status(403).json({ error: `Your role cannot access ${moduleKey}` });
    }
    req.scope = scopeFor(moduleKey, req.user.role);
    next();
  };
}

/* Gate a route on a specific write action. Reading the verification queue and
   clearing an item on it are different permissions. */
export function requirePermission(action) {
  return (req, res, next) => {
    if (!canDo(action, req.user.role)) {
      return res.status(403).json({ error: `Your role cannot perform ${action}` });
    }
    next();
  };
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient role' });
    }
    next();
  };
}

/* Helper for row-level scoping: partners are constrained to their own records
   at the SQL level, never by filtering after the fact. */
export function ownershipFilter(req, column = 'assigned_to') {
  if (seesEverything(req.user.role)) return { clause: '', params: [] };
  return { clause: ` AND ${column} = $OWNER`, params: [req.user.id] };
}

/* Wraps an async handler so a rejected promise reaches the error middleware
   instead of hanging the request. Express 5 does this natively, but being
   explicit keeps it obvious. */
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
  });
}
