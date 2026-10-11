import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import FileField from '../components/FileField';
import { timeAgo } from '../lib/time';
import { roleLabel } from '../lib/roleConfig';
import { BLOCKERS, KIND_LABELS, studioLabel } from '../lib/mediaStatus';
import { useDashboard } from './dashboard/DashboardStore';
import { Chip, Empty, KpiRow, Section, dayBucket, whenLabel } from './dashboard/partner/shared';
import './dashboard/partner/partner.css';

/* Pending Works — one editor's to-do list.

   Everything this editor has claimed, then everything nobody has picked up
   yet, in the order it should be worked: due first, high priority next,
   oldest after that (the server sorts it — routes/media.js /pending).

   Each item can be moved one step along Studio's part of the pipeline from
   here. Approving is not Studio's step, so it is not offered. */

function toLocalInput(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tone(m) {
  if (m.status === 'changes_requested') return 'red';
  if (m.status === 'in_progress' || m.status === 'qc') return 'amber';
  return 'blue';
}

export default function PendingWorks() {
  const { userId, refresh: refreshShell } = useDashboard();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [delivering, setDelivering] = useState(null);
  const [cut, setCut] = useState({ url: '', note: '' });

  const load = useCallback(async () => {
    try {
      const out = await api.media.pending();
      setItems(out.media || []);
    } catch (err) {
      setError(err.message || 'Could not load your work');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(id, fn) {
    setError('');
    setBusy(id);
    try {
      await fn();
      await load();
      refreshShell();
    } catch (err) {
      setError(err.message || 'That did not go through');
    } finally {
      setBusy(null);
    }
  }

  async function deliver(m) {
    if (!cut.url.trim()) return setError('Upload the edited cut, or paste a link to it');
    await run(m.id, () => api.media.deliver(m.id, cut.url.trim(), cut.note.trim() || null));
    setDelivering(null);
    setCut({ url: '', note: '' });
  }

  const mine = items.filter((m) => m.claimed_by === userId);
  const open = items.filter((m) => !m.claimed_by);
  const due = items.filter((m) => ['overdue', 'today'].includes(dayBucket(m.due_at)));

  /* A render function, not a nested component: a component declared in here
     would be a new type on every render, remounting the file picker and
     losing a picked-but-not-yet-uploaded cut. */
  function renderItem(m) {
    const isBusy = busy === m.id;
    return (
      <div className="pd-item" key={m.id}>
        <div className="pd-item-main">
          <div className="pd-item-title">
            <span className={'pd-dot ' + (m.priority === 'high' ? 'red' : 'amber')} aria-hidden="true" />
            {m.title}
          </div>
          <div className="pd-item-meta">
            {KIND_LABELS[m.kind] || m.kind} • from {m.uploaded_by_name || 'unknown'}
            {m.uploaded_by_role ? ` (${roleLabel(m.uploaded_by_role)})` : ''}
            {m.project_name ? ` • ${m.project_name}` : ''} • {timeAgo(m.created_at)}
          </div>
          {m.note && <div className="pd-item-meta">Brief: {m.note}</div>}
          {m.status === 'changes_requested' && m.review_notes && (
            <div className="pd-quote">Revision notes{m.reviewed_by_name ? ` from ${m.reviewed_by_name}` : ''}: “{m.review_notes}”</div>
          )}

          <div className="pd-item-actions">
            {m.url && (
              <a className="btn-ghost" href={m.url} target="_blank" rel="noopener noreferrer">Raw footage ↗</a>
            )}
            {m.status === 'pending' && m.url && (
              <button className="btn" disabled={isBusy} onClick={() => run(m.id, () => api.media.setStatus(m.id, 'in_progress'))}>
                Claim &amp; start
              </button>
            )}
            {m.status === 'pending' && !m.url && <span className="small muted">Waiting for footage from the requester</span>}
            {m.status === 'changes_requested' && (
              <button className="btn" disabled={isBusy} onClick={() => run(m.id, () => api.media.setStatus(m.id, 'in_progress'))}>
                Start revision
              </button>
            )}
            {m.status === 'in_progress' && (
              <button className="btn-ghost" disabled={isBusy} onClick={() => run(m.id, () => api.media.setStatus(m.id, 'qc'))}>
                Send to QC
              </button>
            )}
            {(m.status === 'in_progress' || m.status === 'qc') && (
              <button className="btn" onClick={() => { setDelivering(m.id); setCut({ url: '', note: '' }); }}>
                Submit for approval
              </button>
            )}
          </div>

          {delivering === m.id && (
            <div className="pw-deliver">
              <FileField
                label="Edited cut"
                value={cut.url}
                onChange={(url) => setCut((c) => ({ ...c, url }))}
                accept="video/*,image/*"
                placeholder="Drive / YouTube link, or upload"
                hint="Goes to Core/Founder for approval"
              />
              <textarea
                className="pd-input"
                rows={2}
                value={cut.note}
                onChange={(e) => setCut((c) => ({ ...c, note: e.target.value }))}
                placeholder="Note for the reviewer (optional)"
              />
              <div className="pd-item-actions">
                <button className="btn" disabled={isBusy} onClick={() => deliver(m)}>Send for approval</button>
                <button className="btn-ghost" onClick={() => setDelivering(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div className="pd-item-side pw-side">
          <Chip tone={tone(m)}>{studioLabel(m)}</Chip>
          <label className="pw-field">
            <span>Due</span>
            <input
              type="datetime-local"
              className="pd-inline-select"
              defaultValue={toLocalInput(m.due_at)}
              disabled={isBusy}
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== toLocalInput(m.due_at)) {
                  run(m.id, () => api.media.updateMeta(m.id, { dueAt: v ? new Date(v).toISOString() : '' }));
                }
              }}
            />
          </label>
          {m.due_at && (
            <span className={'small ' + (dayBucket(m.due_at) === 'overdue' ? 'pw-overdue' : 'muted')}>
              {dayBucket(m.due_at) === 'overdue' ? 'Overdue — ' : ''}{whenLabel(m.due_at)}
            </span>
          )}
          <select
            className="pd-inline-select"
            aria-label="Priority"
            value={m.priority || 'normal'}
            disabled={isBusy}
            onChange={(e) => run(m.id, () => api.media.updateMeta(m.id, { priority: e.target.value }))}
          >
            <option value="normal">Normal priority</option>
            <option value="high">High priority</option>
          </select>
          <select
            className="pd-inline-select"
            aria-label="Waiting on"
            value={m.blocked_on || ''}
            disabled={isBusy}
            onChange={(e) => run(m.id, () => api.media.updateMeta(m.id, { blockedOn: e.target.value }))}
          >
            <option value="">Not blocked</option>
            {Object.entries(BLOCKERS).map(([k, label]) => <option key={k} value={k}>Waiting: {label}</option>)}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="pd">
      <header className="pd-hero">
        <h1>Pending Works</h1>
        <p>Your work in the order it should be done, then what is waiting to be picked up.</p>
      </header>

      <KpiRow
        items={[
          { icon: '🎬', label: 'My Work', value: mine.length },
          { icon: '📥', label: 'Up for Grabs', value: open.length },
          { icon: '⏰', label: 'Due Today', value: due.length, hint: 'Including overdue' },
          { icon: '🔄', label: 'Revisions', value: items.filter((m) => m.status === 'changes_requested').length },
          { icon: '⚠️', label: 'Blocked', value: items.filter((m) => m.blocked_on || (m.status === 'pending' && !m.url)).length },
        ]}
      />

      {error && <div className="pd-error">{error}</div>}

      <Section title="🎬 My Work" subtitle="Claimed by you">
        {loading ? <Empty>Loading…</Empty> : mine.length === 0 ? (
          <Empty>Nothing claimed. Pick something up from the list below.</Empty>
        ) : (
          <div className="pd-list">{mine.map(renderItem)}</div>
        )}
      </Section>

      <Section title="📥 Up for Grabs" subtitle="Requests and raw media nobody has claimed yet">
        {loading ? <Empty>Loading…</Empty> : open.length === 0 ? (
          <Empty>Nothing waiting. New requests land here.</Empty>
        ) : (
          <div className="pd-list">{open.map(renderItem)}</div>
        )}
      </Section>
    </div>
  );
}
