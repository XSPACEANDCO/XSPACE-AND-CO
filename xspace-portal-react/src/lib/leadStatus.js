/* Mirrors server/src/leadStatus.js.

   The server is the authority — it rejects a backwards status change and an
   unknown property type whatever this file says. This copy exists so the UI
   can grey out the buttons that would be refused, and offer the right
   configuration units for the chosen property type. */

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

export const DROPPED = 'Dropped';
export const ALL_STATUSES = [...LEAD_STATUSES, DROPPED];

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

export const FUNNEL_STAGES = ['Discovery', 'Engaged', 'Site Visit', 'Decision', 'Closed'];

export const FUNNEL_BUCKETS = [
  { stage: 'Discovery', statuses: ['New'] },
  { stage: 'Engaged', statuses: ['Contacted', 'Listings Presented'] },
  { stage: 'Site Visit', statuses: ['Visit Scheduled', 'Visit Completed'] },
  { stage: 'Decision', statuses: ['Negotiation', 'Token/EOI'] },
  { stage: 'Closed', statuses: ['Closed'] },
];

export function bucketFor(status) {
  return FUNNEL_BUCKETS.find((b) => b.statuses.includes(status))?.stage || null;
}

export const PROPERTY_TYPES = [
  { key: 'apartment', label: 'Apartment', config: 'bhk' },
  { key: 'gated', label: 'Gated Community', config: 'bhk' },
  { key: 'standalone', label: 'Standalone', config: 'bhk' },
  { key: 'villa', label: 'Villa', config: 'bhk' },
  { key: 'land', label: 'Land', config: 'acres' },
  { key: 'commercial', label: 'Commercial', config: 'sft' },
];

export const BHK_OPTIONS = ['1 BHK', '2 BHK', '2.5 BHK', '3 BHK', '3.5 BHK', '4 BHK', '4+ BHK'];

export function propertyLabel(key) {
  return PROPERTY_TYPES.find((p) => p.key === key)?.label || '';
}

/* Bedrooms for a home, acres for land, square feet for a shop. */
export function configKindFor(propertyType) {
  return PROPERTY_TYPES.find((p) => p.key === propertyType)?.config || null;
}

export function configLabelFor(propertyType) {
  const kind = configKindFor(propertyType);
  if (kind === 'bhk') return 'Configuration (BHK)';
  if (kind === 'acres') return 'Extent (acres)';
  if (kind === 'sft') return 'Area (sft)';
  return 'Configuration';
}

/* What the temperature chip shows in the client list. */
export const TEMP_LABELS = { hot: '🔥 Hot', warm: '🌤️ Warm', cold: '❄️ Cold' };
