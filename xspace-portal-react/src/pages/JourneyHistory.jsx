import { DAY, TIME, stamp } from './journeyShared';

/* Every automated email the client was sent, and everything that happened
   to them — the bottom of the client profile. Founder and Core only. */

export const EMAIL_NAMES = {
  'CL-01': 'Cold outreach',
  'CL-02': 'Follow-up',
  'CL-03': 'Re-engagement',
  'CL-04': 'Appointment confirmation',
  'CL-05': 'Appointment reminder',
  'CL-06': 'Shortlisted projects',
  'CL-07': 'Site visit confirmation',
  'CL-08': 'Site visit reminder',
  'CL-09': 'Site visit follow-up',
  'CL-10': 'Deal closure',
  'CL-11': 'Handover',
  'CL-12': 'Feedback request',
  'CL-13': 'Referral request',
  'CL-14': 'Post-handover',
  'CL-15': 'Site visit cancellation',
};

const EMAIL_STATUS = {
  sent: { label: 'Sent', tone: 'completed' },
  logged: { label: 'Not sent — email delivery is off', tone: '' },
  failed: { label: 'Failed', tone: 'cancelled' },
};

export function EmailHistory({ emails }) {
  return (
    <div className="section" id="email-history">
      <h3>Email History</h3>
      {emails.length === 0 ? (
        <div className="muted">Nothing sent yet.</div>
      ) : (
        <div className="journey-table-wrap">
          <table className="journey-table">
            <thead>
              <tr><th>Email type</th><th>Subject</th><th>Date</th><th>Time</th><th>Status</th></tr>
            </thead>
            <tbody>
              {emails.map((e) => {
                const s = EMAIL_STATUS[e.status] || { label: e.status, tone: '' };
                const at = new Date(e.created_at);
                return (
                  <tr key={e.id}>
                    <td>{EMAIL_NAMES[e.code] || e.code}</td>
                    <td>{e.subject}</td>
                    <td>{DAY.format(at)}</td>
                    <td>{TIME.format(at)}</td>
                    <td>
                      <span className={'journey-chip ' + s.tone} title={e.error || undefined}>{s.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ActivityHistory({ activity }) {
  return (
    <div className="section" id="activity-history">
      <h3>Activity History</h3>
      {activity.length === 0 ? (
        <div className="muted">Nothing recorded yet.</div>
      ) : (
        <div className="journey-activity">
          {activity.map((a) => (
            <div className="timeline-item" key={a.id}>
              <div>{a.text}</div>
              <div className="time">
                {stamp(a.created_at)} · {a.actor_name || 'Client / automatic'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
