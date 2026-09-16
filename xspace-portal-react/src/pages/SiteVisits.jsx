import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getRole } from '../lib/storage';
import { usePageClass } from '../hooks/usePageClass';
import './sitevisits.css';

const COLUMNS = [
  { key: 'Scheduled', label: 'Scheduled' },
  { key: 'Completed', label: 'Completed' },
  { key: 'Unsuccessful', label: 'Unsuccessful Visit' },
  { key: 'Rescheduled', label: 'Rescheduled' },
];

const UNSUCCESS_REASONS = [
  'Client Unavailable',
  'No Response',
  'Client Not Confirmed',
  'Client Cancelled',
  'Decision Maker Not Available',
  'Budget Issue',
  'Location Not Liked',
  'Project Not Liked',
  'Unit Not Available',
  'Reschedule Requested',
  'Other (Add Note)',
];

const INITIAL_VISITS = [
  { id: 1, client: 'Ramesh', project: 'MyHome Avatar', timeISO: '2026-02-04T11:00', time: '11:00 AM', agent: 'Sai', mode: 'On-site', status: 'Scheduled', temp: 'hot' },
  { id: 2, client: 'Sita', project: 'Vasavi Skyla', timeISO: '2026-02-04T14:30', time: '2:30 PM', agent: 'Rahul', mode: 'VR', status: 'Completed', temp: 'warm' },
];

const TEMP_LABELS = { hot: '🔥 Hot', warm: '🌤️ Warm', cold: '❄️ Cold' };

const isSoon = (t) => {
  const d = new Date(t) - new Date();
  return d > 0 && d <= 2 * 60 * 60 * 1000;
};
const isOverdue = (t, s) => new Date(t) < new Date() && s === 'Scheduled';

/* Reason -> the follow-up the system would queue automatically. */
function followUpFor(reason) {
  if (reason === 'No Response' || reason === 'Client Unavailable') return 'Auto follow-up call in 24 hrs';
  if (reason === 'Budget Issue') return 'Suggest lower budget listings in 48 hrs';
  if (reason === 'Location Not Liked') return 'Suggest alternate areas in 48 hrs';
  if (reason === 'Project Not Liked') return 'Suggest similar projects in 48 hrs';
  if (reason === 'Reschedule Requested') return 'Reschedule visit with new date & time';
  return 'Manual follow-up in 24–48 hrs';
}

export default function SiteVisits() {
  usePageClass('sitevisits');
  const [params] = useSearchParams();
  const role = getRole();
  const canAct = role === 'founder' || role === 'core';

  const [visits, setVisits] = useState(INITIAL_VISITS);
  const [agentFilter, setAgentFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');

  /* Re-render once a minute so the "Soon" / "Overdue" rings stay truthful. */
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [form, setForm] = useState({ client: '', project: '', time: '', mode: 'On-site', agent: 'Sai' });

  const [rescheduleId, setRescheduleId] = useState(null);
  const [rescheduleTime, setRescheduleTime] = useState('');

  const [unsuccessId, setUnsuccessId] = useState(null);
  const [unsuccessReason, setUnsuccessReason] = useState('');

  /* Deep link from the lead page: /site-visits?dt=<datetime-local value> */
  useEffect(() => {
    const dt = params.get('dt');
    if (dt) {
      setForm((f) => ({ ...f, time: dt }));
      setScheduleOpen(true);
    }
  }, [params]);

  const filtered = useMemo(
    () =>
      visits.filter(
        (v) => (agentFilter === 'all' || v.agent === agentFilter) && (modeFilter === 'all' || v.mode === modeFilter)
      ),
    [visits, agentFilter, modeFilter]
  );

  const todays = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = start.getTime() + 24 * 3600 * 1000;
    return filtered.filter((v) => {
      const ts = new Date(v.timeISO).getTime();
      return ts >= start.getTime() && ts < end;
    });
  }, [filtered]);

  function updateStatus(id, status) {
    setVisits((prev) => prev.map((v) => (v.id === id ? { ...v, status } : v)));
  }

  function saveVisit() {
    if (!form.time) {
      alert('Select date & time');
      return;
    }
    setVisits((prev) => [
      ...prev,
      {
        id: Date.now(),
        client: form.client,
        project: form.project,
        timeISO: form.time,
        time: new Date(form.time).toLocaleString(),
        agent: form.agent,
        mode: form.mode,
        status: 'Scheduled',
        temp: 'warm',
      },
    ]);
    setScheduleOpen(false);
    setForm({ client: '', project: '', time: '', mode: 'On-site', agent: 'Sai' });
  }

  function confirmReschedule() {
    if (!rescheduleTime) {
      alert('Select date & time');
      return;
    }
    setVisits((prev) =>
      prev.map((v) =>
        v.id === rescheduleId
          ? { ...v, timeISO: rescheduleTime, time: new Date(rescheduleTime).toLocaleString(), status: 'Rescheduled' }
          : v
      )
    );
    setRescheduleId(null);
    setRescheduleTime('');
  }

  function confirmUnsuccess() {
    if (!unsuccessReason) {
      alert('Select a reason');
      return;
    }
    setVisits((prev) =>
      prev.map((v) => (v.id === unsuccessId ? { ...v, status: 'Unsuccessful', reason: unsuccessReason } : v))
    );
    alert('Auto Follow-up Created:\n' + followUpFor(unsuccessReason));
    setUnsuccessId(null);
    setUnsuccessReason('');
  }

  function VisitCard({ v }) {
    const soon = isSoon(v.timeISO);
    const over = isOverdue(v.timeISO, v.status);
    return (
      <div className={'visit' + (soon ? ' soon' : '') + (over ? ' overdue' : '')}>
        <strong>{v.client}</strong> <span className={v.temp}>{TEMP_LABELS[v.temp] || ''}</span>
        <br />
        <span className="subtitle">{v.project}</span>
        <br />
        <span className="subtitle">
          {v.time} • {v.agent} • {v.mode}
        </span>
        {soon && <div className="warm">⏰ Soon</div>}
        {over && <div className="hot">⚠️ Overdue</div>}
        {canAct && (
          <div className="visit-actions">
            <button className="action-btn" onClick={() => updateStatus(v.id, 'Completed')}>Done</button>
            <button className="action-btn" onClick={() => setUnsuccessId(v.id)}>Unsuccessful</button>
            <button className="action-btn" onClick={() => setRescheduleId(v.id)}>Reschedule</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-sitevisits">
      <div className="container">
        <div className="topbar">
          <div>
            <h1>Site Visits</h1>
            <div className="subtitle">Daily operations dashboard</div>
          </div>

          <div className="filters">
            <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
              <option value="all">All Agents</option>
              <option value="Sai">Sai</option>
              <option value="Rahul">Rahul</option>
            </select>
            <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}>
              <option value="all">All Modes</option>
              <option value="On-site">On-site</option>
              <option value="VR">VR</option>
            </select>
            <button onClick={() => setScheduleOpen(true)}>+ Schedule Visit</button>
          </div>
        </div>

        <h3>Today’s Visits</h3>
        <div className="today-strip">
          {todays.length === 0 ? (
            <div className="subtitle">No visits scheduled for today.</div>
          ) : (
            todays.map((v) => (
              <div className="card" key={v.id}>
                <strong>{v.client}</strong> <span className={v.temp}>{TEMP_LABELS[v.temp] || ''}</span>
                <div className="muted">{v.project}</div>
                <div className="muted">
                  {v.time} • {v.agent} • {v.mode}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="pipeline">
          {COLUMNS.map((col) => (
            <div className="col" key={col.key}>
              <h3>{col.label}</h3>
              <div>
                {filtered
                  .filter((v) => v.status === col.key)
                  .map((v) => (
                    <VisitCard v={v} key={v.id} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Schedule Modal */}
      {scheduleOpen && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setScheduleOpen(false)}>
          <div className="modal">
            <h3>Schedule Site Visit</h3>
            <label>Client</label>
            <input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
            <label>Project</label>
            <input value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} />
            <label>Date &amp; Time</label>
            <input type="datetime-local" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            <label>Mode</label>
            <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              <option>On-site</option>
              <option>VR</option>
            </select>
            <label>Agent</label>
            <select value={form.agent} onChange={(e) => setForm({ ...form, agent: e.target.value })}>
              <option>Sai</option>
              <option>Rahul</option>
            </select>
            <div className="modal-actions">
              <button onClick={() => setScheduleOpen(false)}>Cancel</button>
              <button className="btn-save" onClick={saveVisit}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleId !== null && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setRescheduleId(null)}>
          <div className="modal">
            <h3>Reschedule Visit</h3>
            <label>New Date &amp; Time</label>
            <input type="datetime-local" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} />
            <div className="modal-actions">
              <button onClick={() => setRescheduleId(null)}>Cancel</button>
              <button className="btn-save" onClick={confirmReschedule}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Unsuccessful Modal */}
      {unsuccessId !== null && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setUnsuccessId(null)}>
          <div className="modal">
            <h3>Mark Unsuccessful Visit</h3>
            <label>Reason</label>
            <select value={unsuccessReason} onChange={(e) => setUnsuccessReason(e.target.value)}>
              <option value="">Select reason</option>
              {UNSUCCESS_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <div className="modal-actions">
              <button onClick={() => setUnsuccessId(null)}>Cancel</button>
              <button className="btn-danger" onClick={confirmUnsuccess}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
