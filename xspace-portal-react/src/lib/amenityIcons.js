/* An icon for an amenity, matched on what was typed.

   Amenities are free text — a realtor can enter anything the property
   actually has — so this cannot be a lookup table keyed by id. It matches on
   keywords instead, and falls back to a neutral marker rather than guessing.
   A wrong icon is worse than no icon: "🏊" next to "No swimming pool" would
   actively mislead. */

const RULES = [
  [/\b(swim|pool)\b/i, '🏊'],
  [/\b(gym|fitness)\b/i, '🏋️'],
  [/\b(club\s?house|clubhouse|community hall|banquet)\b/i, '🏛️'],
  [/\b(security|cctv|surveillance|guard)\b/i, '🛡️'],
  [/\b(park(ing)?|garage|basement)\b/i, '🚗'],
  [/\b(garden|landscap|green|lawn|park)\b/i, '🌳'],
  [/\b(play|kids|child)/i, '🧒'],
  [/\b(jog|walk|track|trail|cycl)/i, '🚶'],
  [/\b(sport|tennis|badminton|basketball|cricket|court)\b/i, '🎾'],
  [/\b(lift|elevator)\b/i, '🛗'],
  [/\b(power|backup|generator|dg)\b/i, '🔌'],
  [/\b(water|borewell|rain\s?water|harvest)\b/i, '💧'],
  [/\b(indoor|game|chess|billiard|table tennis)\b/i, '🎯'],
  [/\b(gas|pipeline)\b/i, '🔥'],
  [/\b(solar)\b/i, '☀️'],
  [/\b(spa|sauna|jacuzzi|steam)\b/i, '🧖'],
  [/\b(theat|cinema|screening|media room)\b/i, '🎬'],
  [/\b(yoga|meditat)\b/i, '🧘'],
  [/\b(temple|prayer|pooja)\b/i, '🛕'],
  [/\b(pet)\b/i, '🐾'],
  [/\b(wifi|internet|broadband|fibre|fiber)\b/i, '📶'],
  [/\b(lounge|cafe|restaurant|dining)\b/i, '☕'],
  [/\b(terrace|rooftop|balcon|deck)\b/i, '🌇'],
  [/\b(fire|sprinkler|safety)\b/i, '🧯'],
  [/\b(amphi|open air|lawn|event)\b/i, '🎪'],
  [/\b(ev|charging)\b/i, '🔋'],
  [/\b(waste|sewage|stp|treatment)\b/i, '♻️'],
  [/\b(intercom|concierge|reception)\b/i, '📞'],
  [/\b(guest|visitor)\b/i, '🛎️'],
  [/\b(library|reading|study)\b/i, '📚'],
  [/\b(senior|elder)\b/i, '🪑'],
];

export function amenityIcon(text) {
  const value = String(text || '');
  for (const [pattern, icon] of RULES) {
    if (pattern.test(value)) return icon;
  }
  return '•';
}

/* Some listings were entered before this existed and already carry an emoji
   at the front of the line. Rendering our own as well would double it up. */
const LEADING_EMOJI = /^\s*(\p{Extended_Pictographic}(\p{Emoji_Modifier}|️|‍\p{Extended_Pictographic})*)\s*/u;

export function splitAmenity(text) {
  const value = String(text || '').trim();
  const match = LEADING_EMOJI.exec(value);
  if (match) return { icon: match[1], label: value.slice(match[0].length).trim() || value };
  return { icon: amenityIcon(value), label: value };
}
