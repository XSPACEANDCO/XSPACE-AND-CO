import { randomUUID } from 'node:crypto';
import { query } from './db.js';

/* Short, readable, collision-free enough for this scale. */
export function newId(prefix = 'x') {
  return `${prefix}_${randomUUID().slice(0, 12)}`;
}

export async function recordAudit(text, actorId, entity = null, entityId = null) {
  await query(
    'INSERT INTO audit_log (id, text, actor_id, entity, entity_id) VALUES ($1,$2,$3,$4,$5)',
    [newId('ad'), text, actorId, entity, entityId]
  );
}

export async function recordActivity(text, actorId) {
  await query('INSERT INTO activity (id, text, actor_id) VALUES ($1,$2,$3)', [
    newId('a'),
    text,
    actorId,
  ]);
}

/* Target either one user (userId) or every holder of a role. */
export async function notify({ userId = null, role = null, type = 'info', title, body = null }) {
  await query(
    'INSERT INTO notifications (id, user_id, role, type, title, body) VALUES ($1,$2,$3,$4,$5,$6)',
    [newId('n'), userId, role, type, title, body]
  );
}
