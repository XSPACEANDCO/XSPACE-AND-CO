/* Accepts what the API actually returns.

   The demo data stored epoch milliseconds; Postgres returns ISO 8601 strings
   ("2026-09-17T00:41:02.123Z"). Subtracting a string from a number gave NaN,
   which is where the "NaNd ago" timestamps came from. */
export function timeAgo(ts) {
  if (!ts) return '';

  const then = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (Number.isNaN(then)) return '';

  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 0) return 'just now';
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  return d + 'd ago';
}
