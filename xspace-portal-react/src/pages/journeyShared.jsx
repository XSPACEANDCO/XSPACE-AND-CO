/* Small pieces shared by the client profile's journey sections
   (ClientJourney.jsx, JourneyDeal.jsx, JourneyHistory.jsx). */

export const STAMP = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
export const DAY = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
export const TIME = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' });

export const stamp = (ts) => (ts ? STAMP.format(new Date(ts)) : '—');

/* A DATE column arrives as midnight UTC; show the calendar day it names
   rather than letting the browser's timezone shift it. */
export function dayOf(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return DAY.format(new Date(y, m - 1, d));
}

/* <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm", not ISO. */
export function toLocalInput(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* <input type="date"> from a DATE column or a timestamp. */
export const toDateInput = (value) => (value ? String(value).slice(0, 10) : '');

/* A local datetime-local value as ISO, or null when empty. */
export const isoOrNull = (local) => (local ? new Date(local).toISOString() : null);

/* One numbered stage of the journey. */
export function Stage({ n, title, done, children, id }) {
  return (
    <div className="section journey-stage" id={id}>
      <h3>
        <span className={'stage-num' + (done ? ' done' : '')}>{done ? '✓' : n}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

/* A labelled input in a .req-grid. */
export function Field({ label, children, wide }) {
  return (
    <label className={wide ? 'journey-wide' : undefined}>
      <span className={wide ? 'muted' : undefined}>{label}</span>
      {children}
    </label>
  );
}

/* The team member picker used by appointments, presentations, follow-ups
   and the closure. */
export function PersonSelect({ value, onChange, people, empty = 'Select…' }) {
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{empty}</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}

/* Listing picker: "Green Meadows — Kokapet — ₹1.2 Cr". */
export function ListingSelect({ value, onChange, listings, exclude, empty = 'Select a project…' }) {
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{empty}</option>
      {listings
        .filter((l) => !exclude || !exclude.has(l.id) || l.id === value)
        .map((l) => (
          <option key={l.id} value={l.id}>
            {l.title}{l.area ? ` — ${l.area}` : ''}{l.price ? ` — ${l.price}` : ''}
          </option>
        ))}
    </select>
  );
}
