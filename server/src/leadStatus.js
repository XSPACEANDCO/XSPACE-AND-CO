/* The one lead pipeline.

   There used to be three vocabularies: the database seeded
   Discovery/Engaged/Site Visit/Decision/Closed, the lead detail screen
   offered New/Contacted/Listings Presented/…, and the client list rendered
   new/contacted/visit/…. Nothing mapped between them, so a status set on one
   screen was unrecognised by the next. This is now the only list, and the
   funnel groups it rather than competing with it. */

export const LEAD_STATUSES = [
  'New',
  'Contacted',
  'Listings Presented',
  'Visit Scheduled',
  'Visit Completed',
  'Negotiation',
  'Token/EOI',
  'Closed',
];

/* Leaving the pipeline entirely. Reachable from anywhere, and final. */
export const DROPPED = 'Dropped';

export const ALL_STATUSES = [...LEAD_STATUSES, DROPPED];

/* A lead moves forward or it drops out; it never reverts. Once someone has
   been contacted, "New" is no longer true, and letting the status go back
   would quietly rewrite what happened. */
export function statusRank(status) {
  return LEAD_STATUSES.indexOf(status);
}

export function canAdvance(from, to) {
  if (to === DROPPED) return from !== DROPPED;
  if (from === DROPPED) return false;
  const a = statusRank(from);
  const b = statusRank(to);
  if (a === -1 || b === -1) return false;
  return b > a;
}

/* The dashboard funnel keeps its five buckets; the richer pipeline above maps
   onto them so both views describe the same leads. */
export const FUNNEL_BUCKETS = [
  { stage: 'Discovery', statuses: ['New'] },
  { stage: 'Engaged', statuses: ['Contacted', 'Listings Presented'] },
  { stage: 'Site Visit', statuses: ['Visit Scheduled', 'Visit Completed'] },
  { stage: 'Decision', statuses: ['Negotiation', 'Token/EOI'] },
  { stage: 'Closed', statuses: ['Closed'] },
];

/* What a requirement can be, and what "configuration" means for each. A flat
   is counted in bedrooms, land in acres and a shop in square feet — one
   dropdown cannot serve all three. */
export const PROPERTY_TYPES = [
  { key: 'apartment', label: 'Apartment', config: 'bhk' },
  { key: 'gated', label: 'Gated Community', config: 'bhk' },
  { key: 'standalone', label: 'Standalone', config: 'bhk' },
  { key: 'villa', label: 'Villa', config: 'bhk' },
  { key: 'land', label: 'Land', config: 'acres' },
  { key: 'commercial', label: 'Commercial', config: 'sft' },
];

export const BHK_OPTIONS = ['1 BHK', '2 BHK', '2.5 BHK', '3 BHK', '3.5 BHK', '4 BHK', '4+ BHK'];

export function configKindFor(propertyType) {
  return PROPERTY_TYPES.find((p) => p.key === propertyType)?.config || null;
}

export function isValidPropertyType(value) {
  return !value || PROPERTY_TYPES.some((p) => p.key === value);
}
