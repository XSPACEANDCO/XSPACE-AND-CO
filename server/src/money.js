/* Rupee amounts as the team types them — "₹1.15 Cr", "82 L", "2,30,000",
   "45k" — turned into a number of rupees. Deal values and commissions are
   stored as that text (lead_deals); the commissions ledger needs the number. */

const UNITS = [
  [/^(cr|crs|crore|crores)$/, 1e7],
  [/^(l|lac|lacs|lakh|lakhs)$/, 1e5],
  [/^(k|thousand)$/, 1e3],
  [/^$/, 1],
];

/* Rupees, or null when the text is not an amount. */
export function parseRupees(text) {
  const s = String(text ?? '')
    .toLowerCase()
    .replace(/₹|rs\.?|inr|\/-/g, '')
    .replace(/,/g, '')
    .trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([a-z]*)$/);
  if (!m) return null;
  const unit = UNITS.find(([re]) => re.test(m[2]));
  if (!unit) return null;
  return Math.round(Number(m[1]) * unit[1] * 100) / 100;
}

/* A commission is either an amount or a percentage of the final deal value.
   Returns { amount } in rupees, or { error } saying what to type instead. */
export function commissionAmount(commission, finalValue) {
  const text = String(commission ?? '').trim();
  const pct = text.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (pct) {
    const value = parseRupees(finalValue);
    if (value === null) {
      return { error: 'A percentage commission needs a final deal value like ₹1.15 Cr or 82 L' };
    }
    return { amount: Math.round(value * Number(pct[1])) / 100 };
  }
  const amount = parseRupees(text);
  if (amount === null) {
    return { error: 'Commission must be an amount (₹2.3 L, 45,000) or a percentage of the deal value (2%)' };
  }
  return { amount };
}
