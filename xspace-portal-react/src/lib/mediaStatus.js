/* How each pipeline state is described to a person.

   Mirrors the states in server/src/routes/media.js. The wording matters:
   "delivered" is a database value, "Waiting on review" is what it actually
   means to whoever is looking at it. */

export const MEDIA_STATES = {
  pending: { label: 'Waiting to be picked up', tone: 'wait' },
  in_progress: { label: 'Being edited', tone: 'work' },
  qc: { label: 'In Studio QC', tone: 'work' },
  delivered: { label: 'Waiting on review', tone: 'review' },
  changes_requested: { label: 'Changes requested', tone: 'changes' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'changes' },
};

export function mediaLabel(status) {
  return MEDIA_STATES[status]?.label || status;
}

/* The same states, worded for the person who asked for the content. A
   creator does not need to know about Studio's internal QC step, and once
   Founder/Core approve a piece it is, from their side, published. */
export function creatorLabel(m) {
  if (m.status === 'pending') return m.url ? 'Submitted' : 'Requested';
  if (m.status === 'in_progress' || m.status === 'qc') return 'In Editing';
  if (m.status === 'delivered') return 'Awaiting Approval';
  if (m.status === 'changes_requested') return 'Revision in Progress';
  if (m.status === 'approved') return 'Published';
  if (m.status === 'rejected') return 'Rejected';
  return m.status;
}

/* And worded for Studio, whose job ends at "Awaiting Core Approval". */
export function studioLabel(m) {
  if (m.status === 'pending') return m.url ? 'Raw Media Received' : 'New Request';
  if (m.status === 'in_progress') return 'In Production';
  if (m.status === 'qc') return 'Studio QC';
  if (m.status === 'delivered') return 'Awaiting Core Approval';
  if (m.status === 'changes_requested') return 'Revision Required';
  if (m.status === 'approved') return 'Approved';
  if (m.status === 'rejected') return 'Rejected';
  return m.status;
}

/* What an item is waiting on, when it is stuck. */
export const BLOCKERS = {
  raw_media: 'Raw media',
  property_info: 'Property information',
  creator_feedback: 'Creator feedback',
};

export const KIND_LABELS = {
  reel: 'Instagram Reel',
  short: 'Short',
  video: 'Property Video',
  photo: 'Photo',
  doc: 'Document',
};
