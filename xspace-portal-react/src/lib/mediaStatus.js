/* How each pipeline state is described to a person.

   Mirrors the states in server/src/routes/media.js. The wording matters:
   "delivered" is a database value, "Waiting on review" is what it actually
   means to whoever is looking at it. */

export const MEDIA_STATES = {
  pending: { label: 'Waiting to be picked up', tone: 'wait' },
  in_progress: { label: 'Being edited', tone: 'work' },
  delivered: { label: 'Waiting on review', tone: 'review' },
  changes_requested: { label: 'Changes requested', tone: 'changes' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'changes' },
};

export function mediaLabel(status) {
  return MEDIA_STATES[status]?.label || status;
}
