import { useState } from 'react';
import LinkGroups from '../components/LinkGroups';
import { GOV_PORTALS, QUICK_TOOLS } from '../lib/links';
import './dashboard/partner/partner.css';

/* Quick Tools: two calculators people otherwise reach for a phone to do,
   and the outside sites the team uses every day. */

const RUPEES = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/* Everything converts through square feet. A gunta is 121 sq yd — the unit
   Telangana land is actually sold in. */
const UNITS = [
  { key: 'sqft', label: 'Sq. ft', sqft: 1 },
  { key: 'sqyd', label: 'Sq. yards', sqft: 9 },
  { key: 'sqm', label: 'Sq. metres', sqft: 10.7639 },
  { key: 'gunta', label: 'Guntas', sqft: 1089 },
  { key: 'acre', label: 'Acres', sqft: 43560 },
  { key: 'hectare', label: 'Hectares', sqft: 107639.1 },
];

const TRIM = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 });

function EmiCalculator() {
  const [amount, setAmount] = useState('5000000');
  const [rate, setRate] = useState('8.5');
  const [years, setYears] = useState('20');

  const P = Number(amount);
  const r = Number(rate) / 12 / 100;
  const n = Number(years) * 12;
  const valid = P > 0 && n > 0 && r >= 0;
  const emi = !valid ? 0 : r === 0 ? P / n : (P * r * (1 + r) ** n) / ((1 + r) ** n - 1);
  const total = emi * n;

  return (
    <section className="panel pd-section">
      <h4>🏦 Home loan EMI</h4>
      <div className="muted small pd-sub">For a buyer asking "what will I pay a month?"</div>
      <div className="qt-form">
        <label>
          <span>Loan amount (₹)</span>
          <input type="number" min="0" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          <span>Interest (% a year)</span>
          <input type="number" min="0" step="0.05" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
        <label>
          <span>Tenure (years)</span>
          <input type="number" min="1" max="40" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} />
        </label>
      </div>
      <div className="pd-figures">
        <div className="pd-figure green">
          <div className="pd-figure-value">{valid ? RUPEES.format(emi) : '—'}</div>
          <div className="pd-figure-label">Monthly EMI</div>
        </div>
        <div className="pd-figure">
          <div className="pd-figure-value">{valid ? RUPEES.format(total - P) : '—'}</div>
          <div className="pd-figure-label">Total interest</div>
        </div>
        <div className="pd-figure">
          <div className="pd-figure-value">{valid ? RUPEES.format(total) : '—'}</div>
          <div className="pd-figure-label">Total payable</div>
        </div>
      </div>
    </section>
  );
}

function AreaConverter() {
  const [value, setValue] = useState('1');
  const [from, setFrom] = useState('acre');

  const base = Number(value) * (UNITS.find((u) => u.key === from)?.sqft || 1);
  const valid = Number(value) >= 0 && value !== '';

  return (
    <section className="panel pd-section">
      <h4>📐 Land &amp; area converter</h4>
      <div className="muted small pd-sub">Acres, guntas, square yards and the rest</div>
      <div className="qt-form">
        <label>
          <span>Value</span>
          <input type="number" min="0" step="any" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label>
          <span>Unit</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {UNITS.map((u) => (
              <option key={u.key} value={u.key}>{u.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="pd-figures">
        {UNITS.filter((u) => u.key !== from).map((u) => (
          <div className="pd-figure" key={u.key}>
            <div className="pd-figure-value">{valid ? TRIM.format(base / u.sqft) : '—'}</div>
            <div className="pd-figure-label">{u.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function QuickTools() {
  return (
    <div className="pd">
      <header className="pd-hero">
        <h1>Quick Tools</h1>
        <p>Calculators, maps and the sites the team uses every day.</p>
      </header>

      <div className="pd-grid qt-grid">
        <div className="pd-col">
          <section className="panel pd-section">
            <h4>🧰 Tools</h4>
            <LinkGroups groups={QUICK_TOOLS} />
          </section>
          <section className="panel pd-section">
            <h4>🏛️ Government portals</h4>
            <div className="muted small pd-sub">Official sources for checking a property</div>
            <LinkGroups groups={GOV_PORTALS} />
          </section>
        </div>

        <aside className="pd-col">
          <EmiCalculator />
          <AreaConverter />
        </aside>
      </div>
    </div>
  );
}
