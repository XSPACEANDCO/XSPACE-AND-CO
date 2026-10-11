import { useNavigate } from 'react-router-dom';
import { creatorLabel } from '../../lib/mediaStatus';
import { useDashboard } from '../dashboard/DashboardStore';
import { contentTone } from '../dashboard/partner/CreatorDashboard';
import { Chip, Empty, Section, dayBucket, timeOf, whenLabel } from '../dashboard/partner/shared';
import '../dashboard/partner/partner.css';

/* Content Calendar — the creator's content by when it is wanted.

   A date comes from "Wanted by" when the content is submitted, or from
   Studio when they schedule it. Published pieces drop off: the calendar is
   for what is still coming. */

const BUCKETS = [
  { key: 'overdue', title: '⏰ Overdue' },
  { key: 'today', title: '📍 Today' },
  { key: 'tomorrow', title: '➡️ Tomorrow' },
  { key: 'later', title: '🗓️ Later' },
];

export default function ContentCalendar() {
  const navigate = useNavigate();
  const { media } = useDashboard();

  const upcoming = media
    .filter((m) => m.status !== 'approved' && m.status !== 'rejected')
    .sort((a, b) => (timeOf(a.dueAt) ?? Infinity) - (timeOf(b.dueAt) ?? Infinity));
  const dated = upcoming.filter((m) => m.dueAt);
  const undated = upcoming.filter((m) => !m.dueAt);

  return (
    <div className="pd">
      <header className="pd-hero">
        <h1>Content Calendar</h1>
        <p>What is coming up, and when it is due.</p>
      </header>

      <div className="pd-actions">
        <div className="pd-actions-row">
          <button className="btn" onClick={() => navigate('/media-upload')}>+ Submit Content</button>
        </div>
      </div>

      {dated.length === 0 && (
        <Section title="Nothing scheduled">
          <Empty>Set a “Wanted by” date when you submit content and it will be planned here.</Empty>
        </Section>
      )}

      {BUCKETS.map((b) => {
        const items = dated.filter((m) => dayBucket(m.dueAt) === b.key);
        if (!items.length) return null;
        return (
          <Section key={b.key} title={b.title}>
            <div className="pd-list">
              {items.map((m) => (
                <div className="pd-item" key={m.id}>
                  <div className="pd-item-main">
                    <div className="pd-item-title">{m.title}</div>
                    <div className="pd-item-meta">Due {whenLabel(m.dueAt)}</div>
                  </div>
                  <div className="pd-item-side">
                    <Chip tone={contentTone(m)}>{creatorLabel(m)}</Chip>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        );
      })}

      {undated.length > 0 && (
        <Section title="📝 No date yet" subtitle="In production without a due date">
          <div className="pd-list">
            {undated.map((m) => (
              <div className="pd-item" key={m.id}>
                <div className="pd-item-main">
                  <div className="pd-item-title">{m.title}</div>
                </div>
                <div className="pd-item-side">
                  <Chip tone={contentTone(m)}>{creatorLabel(m)}</Chip>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
