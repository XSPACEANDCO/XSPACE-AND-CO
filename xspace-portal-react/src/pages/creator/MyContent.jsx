import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { timeAgo } from '../../lib/time';
import { KIND_LABELS, creatorLabel } from '../../lib/mediaStatus';
import { useDashboard } from '../dashboard/DashboardStore';
import { contentTone } from '../dashboard/partner/CreatorDashboard';
import { useCreatorStats } from '../dashboard/partner/creatorStats';
import { Chip, Empty, Section, compact } from '../dashboard/partner/shared';
import '../dashboard/partner/partner.css';

/* My Content — the creator's own library.

   Finished cuts land here once Founder/Core approve them, with the link to
   the edited file. Views are entered by the creator from their Instagram or
   YouTube insights; nothing reads those platforms automatically, so this is
   where reach on the dashboard comes from. */

function ViewsEditor({ item, onSaved }) {
  const [value, setValue] = useState(item.views ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setError('');
    setBusy(true);
    try {
      await api.media.updateMeta(item.id, { views: value === '' ? null : value });
      await onSaved();
    } catch (err) {
      setError(err.message || 'Could not save views');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mc-views">
      <input
        className="pd-input"
        type="number"
        min="0"
        inputMode="numeric"
        placeholder="Views"
        aria-label={`Views for ${item.title}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button className="btn-ghost" disabled={busy || String(value) === String(item.views ?? '')} onClick={save}>
        {busy ? 'Saving…' : 'Save views'}
      </button>
      {error && <div className="pd-error">{error}</div>}
    </div>
  );
}

export default function MyContent() {
  const navigate = useNavigate();
  const { refresh } = useDashboard();
  const s = useCreatorStats();

  const leadsFor = (id) => s.leads.filter((l) => l.sourceMediaId === id).length;
  const inProduction = s.media.filter((m) => m.status !== 'approved');

  return (
    <div className="pd">
      <header className="pd-hero">
        <h1>My Content</h1>
        <p>Your finished, approved content — and everything still with Studio.</p>
      </header>

      <div className="pd-actions">
        <div className="pd-actions-row">
          <button className="btn" onClick={() => navigate('/media-upload')}>+ Submit Content</button>
          <button className="btn-ghost" onClick={() => navigate('/content-calendar')}>📅 Content Calendar</button>
        </div>
      </div>

      <Section
        title="✅ Published"
        subtitle="Edited by Studio and approved. Add the view count from your insights to track reach."
      >
        {s.published.length === 0 ? (
          <Empty>Nothing published yet. Finished cuts appear here as soon as they are approved.</Empty>
        ) : (
          <div className="pd-list">
            {s.published.map((m) => (
              <div className="pd-item" key={m.id}>
                <div className="pd-item-main">
                  <div className="pd-item-title">{m.title}</div>
                  <div className="pd-item-meta">
                    {KIND_LABELS[m.kind] || m.kind}
                    {m.projectName ? ` • ${m.projectName}` : ''}
                    {' • '}
                    {m.views === null || m.views === undefined ? 'views not added' : `${compact(m.views)} views`}
                    {' • '}
                    {leadsFor(m.id)} leads
                  </div>
                  <div className="pd-item-actions">
                    {m.editedUrl && (
                      <a className="btn-ghost" href={m.editedUrl} target="_blank" rel="noopener noreferrer">
                        Watch finished cut ↗
                      </a>
                    )}
                    <ViewsEditor item={m} onSaved={refresh} />
                  </div>
                </div>
                <div className="pd-item-side">
                  <Chip tone="green">🟢 Published</Chip>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="🎬 In Production" subtitle="Creator → Studio → Approval → Published">
        {inProduction.length === 0 ? (
          <Empty>Nothing with Studio right now.</Empty>
        ) : (
          <div className="pd-list">
            {inProduction.map((m) => (
              <div className="pd-item" key={m.id}>
                <div className="pd-item-main">
                  <div className="pd-item-title">{m.title}</div>
                  <div className="pd-item-meta">
                    {KIND_LABELS[m.kind] || m.kind} • sent {timeAgo(m.createdAt)}
                    {m.claimedByName ? ` • with ${m.claimedByName}` : ''}
                  </div>
                </div>
                <div className="pd-item-side">
                  <Chip tone={contentTone(m)}>{creatorLabel(m)}</Chip>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
