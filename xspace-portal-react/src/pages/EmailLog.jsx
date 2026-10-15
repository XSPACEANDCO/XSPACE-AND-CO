import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { timeAgo } from '../lib/time';

/* Every automated email, newest first — Founder and Core only.

   The automations send these on their own (server/src/automations.js); this
   is where to check that a partner or client was actually told something.
   Without RESEND_API_KEY on the server nothing leaves it, and each row reads
   "Logged" instead of "Sent". */

const AUDIENCES = [
  { key: '', label: 'Everyone' },
  { key: 'RP', label: 'Realtor partners' },
  { key: 'CP', label: 'Creator partners' },
  { key: 'ST', label: 'Studio' },
  { key: 'CL', label: 'Clients' },
  { key: 'XS', label: 'Founder & Core' },
];

const STATUS = {
  sent: { label: 'Sent', tone: 'on' },
  logged: { label: 'Logged — not sent', tone: 'idle' },
  failed: { label: 'Failed', tone: 'off' },
};

export default function EmailLog({ search = '' }) {
  const [code, setCode] = useState('');
  const [emails, setEmails] = useState([]);
  const [delivering, setDelivering] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const out = await api.automations.emails({ code, q: search.trim() || undefined, limit: 200 });
      setEmails(out.emails || []);
      setDelivering(Boolean(out.delivering));
    } catch (err) {
      setError(err.message || 'Could not load the email log');
    } finally {
      setLoading(false);
    }
  }, [code, search]);

  useEffect(() => {
    load();
  }, [load]);

  /* Reminders, escalations and digests otherwise run every 15 minutes. */
  async function runNow() {
    setBusy(true);
    setError('');
    try {
      await api.automations.runNow();
      setNote('Reminders checked');
      setTimeout(() => setNote(''), 3000);
      await load();
    } catch (err) {
      setError(err.message || 'Could not run the reminders');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="email-log">
      <div className="email-log-bar">
        <select value={code} onChange={(e) => setCode(e.target.value)} aria-label="Who the email went to">
          {AUDIENCES.map((a) => (
            <option key={a.key} value={a.key}>{a.label}</option>
          ))}
        </select>
        <button className="teams-link" disabled={busy} onClick={runNow}>
          {busy ? 'Running…' : 'Run reminders now'}
        </button>
        {note && <span className="email-log-note">{note}</span>}
      </div>

      {!delivering && (
        <div className="teams-note">
          Email delivery is off: RESEND_API_KEY is not set on the server, so these are recorded
          but nobody receives them.
        </div>
      )}
      {error && <div className="teams-error">{error}</div>}

      {loading ? (
        <div className="teams-empty">Loading…</div>
      ) : emails.length === 0 ? (
        <div className="teams-empty">No automated emails yet.</div>
      ) : (
        <div className="email-log-rows">
          {emails.map((e) => {
            const status = STATUS[e.status] || { label: e.status, tone: 'idle' };
            return (
              <div className="email-log-row" key={e.id}>
                <span className="email-log-code">{e.code}</span>
                <div className="email-log-main">
                  <div className="email-log-subject">{e.subject}</div>
                  <div className="email-log-meta">
                    {e.user_name ? `${e.user_name} · ` : ''}
                    {e.to_email} · {timeAgo(e.created_at)}
                  </div>
                  {e.error && <div className="email-log-error">{e.error}</div>}
                </div>
                <span className={'tcard-status is-' + status.tone}>{status.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
