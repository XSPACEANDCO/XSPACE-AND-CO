import { useNavigate } from 'react-router-dom';

/* Building blocks shared by the Realtor, Creator and Studio dashboards.

   Each of those dashboards counts its own numbers from the records the
   server already scoped to that person (DashboardStore), so nothing here
   fetches — these only lay the numbers out. */

const DAY = 24 * 60 * 60 * 1000;

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function timeOf(ts) {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  return Number.isNaN(t) ? null : t;
}

/* 'overdue' | 'today' | 'tomorrow' | 'later' | null */
export function dayBucket(ts) {
  const t = timeOf(ts);
  if (t === null) return null;
  const today = startOfToday();
  if (t < today) return 'overdue';
  if (t < today + DAY) return 'today';
  if (t < today + 2 * DAY) return 'tomorrow';
  return 'later';
}

const CLOCK = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
const DAY_MONTH = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

/* "Today, 6:00 pm" / "Tomorrow, 11:30 am" / "11 Oct". A date stored without
   a meaningful time (midnight) drops the clock. */
export function whenLabel(ts, { withTime = true } = {}) {
  const t = timeOf(ts);
  if (t === null) return '';
  const d = new Date(t);
  const hasTime = withTime && (d.getHours() !== 0 || d.getMinutes() !== 0);
  const clock = hasTime ? `, ${CLOCK.format(d)}` : '';
  const bucket = dayBucket(ts);
  if (bucket === 'today') return 'Today' + clock;
  if (bucket === 'tomorrow') return 'Tomorrow' + clock;
  return DAY_MONTH.format(d) + clock;
}

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export function compact(n) {
  return COMPACT.format(n || 0);
}

const RUPEES = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
export function rupees(n) {
  return RUPEES.format(n || 0);
}

export function percent(part, whole) {
  if (!whole) return '0%';
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

/* ---------- Page header ---------- */
export function Hero({ name, subtitle }) {
  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  return (
    <header className="pd-hero">
      <h1>Welcome back, {first} 👋</h1>
      <p>{subtitle}</p>
    </header>
  );
}

/* ---------- KPI row ----------
   items: [{ icon, label, value, hint? }] */
export function KpiRow({ items }) {
  return (
    <section className="pd-kpis" aria-label="Key numbers">
      {items.map((k) => (
        <div className="pd-kpi" key={k.label}>
          <div className="pd-kpi-label">
            {k.icon && <span aria-hidden="true">{k.icon} </span>}
            {k.label}
          </div>
          <div className="pd-kpi-value">{k.value}</div>
          {k.hint && <div className="pd-kpi-hint">{k.hint}</div>}
        </div>
      ))}
    </section>
  );
}

/* ---------- Quick actions ----------
   actions: [{ label, to }] — the first one is the primary. */
export function ActionBar({ title, actions }) {
  const navigate = useNavigate();
  return (
    <section className="pd-actions" aria-label={title}>
      <div className="pd-actions-title">{title}</div>
      <div className="pd-actions-row">
        {actions.map((a, i) => (
          <button
            key={a.label}
            type="button"
            className={i === 0 ? 'btn' : 'btn-ghost'}
            onClick={() => navigate(a.to)}
          >
            {a.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------- Section ----------
   `more` is the "View all →" link at the foot of the section. */
export function Section({ title, subtitle, more, className = '', children }) {
  const navigate = useNavigate();
  return (
    <section className={'panel pd-section ' + className}>
      <h4>{title}</h4>
      {subtitle && <div className="muted small pd-sub">{subtitle}</div>}
      {children}
      {more && (
        <div className="pd-more">
          <button type="button" className="pd-link" onClick={() => navigate(more.to)}>
            {more.label} →
          </button>
        </div>
      )}
    </section>
  );
}

export function Empty({ children }) {
  return <div className="small muted pd-empty">{children}</div>;
}

/* ---------- Status chip ----------
   tone: red | amber | purple | blue | green | grey */
export function Chip({ tone = 'grey', children }) {
  return <span className={`pd-chip ${tone}`}>{children}</span>;
}

/* Chip colour for a lead's pipeline stage. */
export function leadTone(status) {
  if (status === 'Closed') return 'green';
  if (status === 'Dropped') return 'grey';
  if (status === 'New' || status === 'Contacted') return 'blue';
  return 'amber';
}

/* "3 BHK • Kokapet • ₹1.40 Cr" — whatever of the requirement is known. */
export function requirementLine(lead) {
  return [lead.configuration, lead.preferredArea, lead.budget].filter(Boolean).join(' • ');
}

/* A row of small figures: [{ label, value, tone? }] */
export function Figures({ items }) {
  return (
    <div className="pd-figures">
      {items.map((f) => (
        <div className={'pd-figure' + (f.tone ? ' ' + f.tone : '')} key={f.label}>
          <div className="pd-figure-value">{f.value}</div>
          <div className="pd-figure-label">{f.label}</div>
        </div>
      ))}
    </div>
  );
}

/* Activity / event list: [{ id, title, detail?, at }] */
export function Feed({ items, empty }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="pd-feed">
      {items.map((e) => (
        <li key={e.id}>
          <div className="pd-feed-title">{e.title}</div>
          <div className="small muted">
            {e.detail ? `${e.detail} · ` : ''}
            {e.ago}
          </div>
        </li>
      ))}
    </ul>
  );
}
