import { many } from './db.js';
import { parseRupees } from './money.js';

/* "We have this": which projects in the verified book fit what a client asked
   for. Shown to Founder and Core on the CRM list and the client's page, so a
   requirement that Xspace can already serve is never left waiting.

   A client matches a project when one of its verified, unsold listings agrees
   with ANY part of the requirement the client gave: area, property type (and
   sub-type), bedrooms, or budget against price. Each match says which parts
   agreed, and the ones agreeing on most come first. A part counts only when
   the listing's record shows it — unreadable budgets or prices are skipped
   rather than guessed at.

   Nothing is stored: matches are worked out on each read, so they follow the
   book as listings are verified, sold or edited. */

/* Finished clients have nothing left to match. */
const DONE_STATUSES = ['Closed', 'Dropped'];

/* "Kokapet / Narsingi", "Gachibowli, Kondapur" — any one of them will do. */
function areaTokens(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[/,|&]|\bor\b/)
    .map((s) => s.replace(/[^a-z0-9]/g, ''))
    .filter((s) => s.length >= 3);
}
const NO_PREFERENCE = /open to suggestions|any(where)?$|no preference|flexible/i;

function areaMatches(wanted, listingArea) {
  const want = areaTokens(wanted);
  const have = areaTokens(listingArea).join(' ');
  if (!have) return false;
  return want.some((w) => have.includes(w) || have.split(' ').some((h) => w.includes(h)));
}

/* Bedroom counts in "2, 3 BHK", "2 & 2.5 BHK", "3BHK". */
function bhkCounts(text) {
  const s = String(text || '').toLowerCase();
  if (!/bhk|bed/.test(s)) return [];
  return [...s.matchAll(/(\d+(?:\.5)?)\s*\+?/g)].map((m) => Number(m[1]));
}

function bhkMatches(wanted, listingConfig) {
  const want = bhkCounts(wanted)[0];
  if (want === undefined) return null; // acres, sft: not compared
  const have = bhkCounts(listingConfig);
  if (!have.length) return false;
  /* "4+ BHK" is four or more. */
  return /\+/.test(wanted) ? have.some((n) => n >= want) : have.includes(want);
}

/* A rupee range from how people write budgets and prices: "Under ₹75 L",
   "₹75 L – 1.2 Cr", "₹1.2 – 2 Cr", "₹3.5 Cr +", "1.1 Cr onwards", "95 L".
   Returns [min, max] in rupees, or null when it cannot be read. A single
   figure is exact unless `ceiling`, as for a budget: "1.5 Cr" is up to 1.5. */
export function rupeeRange(text, { ceiling = false } = {}) {
  let s = String(text || '').toLowerCase().replace(/₹|rs\.?|inr|\/-|approx\.?|~/g, '').replace(/,/g, '').trim();
  if (!s) return null;
  let open = null;
  if (/^(under|below|upto|up to|within|max(imum)?|less than)\b/.test(s)) {
    open = 'below';
    s = s.replace(/^(under|below|upto|up to|within|max(imum)?|less than)\s*/, '');
  } else if (/(\+|\bonwards|\babove|\bplus)$/.test(s) || /^(from|starting|above|min(imum)?)\b/.test(s)) {
    open = 'above';
    s = s.replace(/(\+|\bonwards|\babove|\bplus)$/, '').replace(/^(from|starting( at| from)?|above|min(imum)?)\s*/, '');
  }
  const parts = s.split(/\s*(?:–|—|-|\bto\b)\s*/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length || parts.length > 2) return null;
  /* "1.2 – 2 Cr": the first figure borrows the second's unit. */
  const unit = (p) => (p.match(/[a-z]+$/) || [''])[0];
  const values = parts.map((p) => parseRupees(/[a-z]$/.test(p) ? p : `${p} ${unit(parts[parts.length - 1])}`));
  if (values.some((v) => v === null || !v)) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (open === 'below' || (ceiling && !open && values.length === 1)) return [0, hi];
  if (open === 'above') return [lo, Infinity];
  return [lo, hi];
}

/* A budget is a ceiling people stretch a little: allow 10% over it. */
function budgetMatches(budget, listing) {
  const want = rupeeRange(budget, { ceiling: true });
  if (!want) return null;
  const have = rupeeRange(listing.all_inclusive) || rupeeRange(listing.price) || rupeeRange(listing.base_price);
  if (!have) return null;
  return have[0] <= want[1] * 1.1 && have[1] >= want[0] * 0.9;
}

/* The parts of the requirement this listing satisfies, by name. Any one is
   enough to show; how many is what ranks them. */
function matchedParts(lead, l) {
  const parts = [];
  if (lead.preferred_area && !NO_PREFERENCE.test(lead.preferred_area) && areaMatches(lead.preferred_area, l.area)) {
    parts.push('Area');
  }
  if (lead.property_type && l.property_type === lead.property_type
      && (!lead.property_subtype || !l.property_subtype || l.property_subtype === lead.property_subtype)) {
    parts.push('Type');
  }
  if (lead.configuration && bhkMatches(lead.configuration, l.configuration)) parts.push('BHK');
  if (lead.budget && budgetMatches(lead.budget, l)) parts.push('Budget');
  return parts;
}

/* The verified, unsold inventory, with the project each listing belongs to. */
export async function loadBook() {
  return many(
    `SELECT l.id, l.title, l.area, l.property_type, l.property_subtype, l.configuration,
            l.price, l.base_price, l.all_inclusive, p.id AS project_id, p.name AS project_name
       FROM listings l JOIN projects p ON p.id = l.project_id
      WHERE l.verified AND l.status !~* 'sold'`
  );
}

/* [{ id, name, matched: ['Area', 'BHK'], listings: [{ id, title, matched }] }]
   for one lead. A project is ranked by its best listing: most parts matched
   first, then most matching listings. */
export function matchingProjects(lead, book) {
  if (DONE_STATUSES.includes(lead.status)) return [];
  const byProject = new Map();
  for (const l of book) {
    const matched = matchedParts(lead, l);
    if (!matched.length) continue;
    const p = byProject.get(l.project_id) || { id: l.project_id, name: l.project_name, matched: [], listings: [] };
    p.listings.push({ id: l.id, title: l.title, matched });
    if (matched.length > p.matched.length) p.matched = matched;
    byProject.set(l.project_id, p);
  }
  for (const p of byProject.values()) p.listings.sort((a, b) => b.matched.length - a.matched.length);
  return [...byProject.values()].sort(
    (a, b) => b.matched.length - a.matched.length || b.listings.length - a.listings.length
  );
}
