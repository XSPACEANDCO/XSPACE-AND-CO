import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { timeAgo } from '../lib/time';
import { EMAIL_NAMES } from './ClientJourney';

/* Every email the portal has sent, newest first — Founder and Core only.

   Two kinds: the welcome and portal-access emails every new account gets
   (server/src/automations.js), and the client journey emails CL-01..13
   (server/src/clientJourney.js). Everything
   else reaches staff and partners as an in-app notification. Without BREVO_API_KEY or RESEND_API_KEY on the server
   nothing leaves it, and each row reads "Logged" instead of "Sent". */

const KINDS = {
  'EM-01': 'Welcome',
  'EM-02': 'Portal access',
  ...EMAIL_NAMES,
};

const STATUS = {
  sent: { label: 'Sent', tone: 'on' },
  logged: { label: 'Logged — not sent', tone: 'idle' },
  failed: { label: 'Failed', tone: 'off' },
};

export default function EmailLog({ search = '' }) {
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
      const out = await api.automations.emails({ q: search.trim() || undefined, limit: 200 });
      setEmails(out.emails || []);
      setDelivering(Boolean(out.delivering));
    } catch (err) {
      setError(err.message || 'Could not load the email log');
    } finally {
      setLoading(false);
    }
  }, [search]);

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
        <span className="email-log-note">
          Welcome and portal-access emails for new accounts, and the client journey emails.
        </span>
        <button className="teams-link" disabled={busy} onClick={runNow}>
          {busy ? 'Running…' : 'Run reminders now'}
        </button>
        {note && <span className="email-log-note">{note}</span>}
      </div>

      {!delivering && (
        <div className="teams-note">
          Email delivery is off: neither BREVO_API_KEY nor RESEND_API_KEY is set on the server, so these are recorded
          but nobody receives them.
        </div>
      )}
      {error && <div className="teams-error">{error}</div>}

      {loading ? (
        <div className="teams-empty">Loading…</div>
      ) : emails.length === 0 ? (
        <div className="teams-empty">No emails yet.</div>
      ) : (
        <div className="email-log-rows">
          {emails.map((e) => {
            const status = STATUS[e.status] || { label: e.status, tone: 'idle' };
            return (
              <div className="email-log-row" key={e.id}>
                <span className="email-log-code">{KINDS[e.code] || e.code}</span>
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
