import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRole } from '../lib/storage';
import { usePageClass } from '../hooks/usePageClass';
import './leadview.css';

const STATUS_CLASS = {
  New: 'new',
  Contacted: 'contacted',
  'Listings Presented': 'presented',
  'Visit Scheduled': 'scheduled',
  'Visit Completed': 'completed',
  Negotiation: 'negotiation',
  'Token/EOI': 'token',
  Closed: 'closed',
  Dropped: 'dropped',
};

const SIMPLE_STATUSES = [
  'New',
  'Contacted',
  'Visit Scheduled',
  'Visit Completed',
  'Negotiation',
  'Token/EOI',
  'Closed',
  'Dropped',
];

const SHORTLIST = [
  { name: 'MyHome Avatar', detail: 'Tellapur • 2BHK • ₹88L' },
  { name: 'Vasavi Skyla', detail: 'Nallagandla • 2BHK • ₹92L' },
  { name: 'ASBL Loft', detail: 'Kondapur • 2BHK • ₹85L' },
];

export default function LeadView() {
  usePageClass('leadview');
  const navigate = useNavigate();
  const role = getRole();

  const [status, setStatus] = useState('Visit Completed');
  const [statusTime, setStatusTime] = useState('Last updated: Today, 4:30 PM');
  const [presentMode, setPresentMode] = useState('');
  const [appliedMode, setAppliedMode] = useState('');
  const [quickDate, setQuickDate] = useState('');
  const [note, setNote] = useState(
    'Client liked tower B.\nNeeds bank loan ~70%.\nFather will join next visit.'
  );

  /* Only Founder/Core could drive the status machine in the original. */
  const canEditStatus = role === 'founder' || role === 'core';

  function applyStatus(next) {
    setStatus(next);
    setStatusTime('Last updated: ' + new Date().toLocaleString());
    if (next !== 'Listings Presented') setAppliedMode('');
  }

  function markPresented() {
    if (!presentMode) {
      alert('Select presentation mode');
      return;
    }
    setAppliedMode(presentMode);
    setStatus('Listings Presented');
    setStatusTime('Last updated: ' + new Date().toLocaleString());
  }

  function scheduleVisit() {
    if (!quickDate) {
      alert('Select date & time first');
      return;
    }
    navigate('/site-visits?dt=' + encodeURIComponent(quickDate));
  }

  return (
    <div className="page-leadview">
      <div className="container">
        {/* HEADER */}
        <div className="section">
          <div className="header-top">
            <div className="client-name">
              Ramesh Kumar <span className="hot">🔥 Hot</span>
            </div>
            <div className="muted">📞 +91 90000 11111</div>
            <div className="muted">🔗 Lead Source: Instagram</div>
            <div className="muted">👤 Lead Owner: Sai (Xspace Core)</div>
          </div>

          <div className="status-wrap">
            <div className="muted">Current Status</div>
            <div className={'status-badge ' + (STATUS_CLASS[status] || 'completed')}>{status}</div>
            <div className="muted">{statusTime}</div>

            {appliedMode && (
              <div className="muted present-mode">
                Presentation Mode: <strong>{appliedMode}</strong>
              </div>
            )}

            {canEditStatus && (
              <>
                <div className="actions">
                  <button className="action" onClick={() => applyStatus('New')}>New</button>
                  <button className="action" onClick={() => applyStatus('Contacted')}>Contacted</button>

                  <div className="present-row">
                    <select value={presentMode} onChange={(e) => setPresentMode(e.target.value)}>
                      <option value="">Listings Presented (select mode)</option>
                      <option value="Office">🏢 Office</option>
                      <option value="In Person">👥 In Person</option>
                      <option value="Zoom">💻 Zoom</option>
                    </select>
                    <button className="action" onClick={markPresented}>Mark Presented</button>
                  </div>

                  {SIMPLE_STATUSES.slice(2).map((s) => (
                    <button key={s} className="action" onClick={() => applyStatus(s)}>
                      {s}
                    </button>
                  ))}
                </div>

                <div className="schedule-block">
                  <div className="muted">Schedule Site Visit</div>
                  <input type="datetime-local" value={quickDate} onChange={(e) => setQuickDate(e.target.value)} />
                  <button className="action" onClick={scheduleVisit}>Schedule Site Visit</button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* REQUIREMENT */}
        <div className="section">
          <h3>Requirement Snapshot</h3>
          <div className="grid">
            <div className="box"><strong>Budget</strong>₹70 – 90 Lakhs</div>
            <div className="box"><strong>Preferred Area</strong>Kukatpally / Hitech City</div>
            <div className="box"><strong>Property Type</strong>2BHK – Gated Community</div>
            <div className="box"><strong>Timeline</strong>Immediate (30 days)</div>
          </div>
        </div>

        {/* ACTIVITY */}
        <div className="section">
          <h3>Activity Timeline</h3>
          <div className="timeline-item">
            <div><strong>Site Visit Completed</strong> – MyHome Avatar</div>
            <div className="time">12 Jan 2026 • Agent: Sai</div>
          </div>
        </div>

        {/* SHORTLISTED PROJECTS */}
        <div className="section">
          <h3>Shortlisted Projects</h3>
          <div className="shortlist">
            {SHORTLIST.map((s) => (
              <div className="short-item" key={s.name}>
                <strong>{s.name}</strong>
                <span>{s.detail}</span>
              </div>
            ))}
          </div>
        </div>

        {/* SITE VISITS */}
        <div className="section">
          <h3>Site Visits</h3>
          <div className="muted">
            • MyHome Avatar – 12 Jan 2026 (Completed)
            <br />• Vasavi Skyla – Scheduled (15 Jan 2026)
          </div>
        </div>

        {/* NOTES */}
        <div className="section">
          <h3>Internal Notes (Agent Only)</h3>
          <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="note-actions">
            <button onClick={() => alert('Note saved (demo).')}>Save Note</button>
          </div>
        </div>
      </div>
    </div>
  );
}
