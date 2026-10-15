import { config } from './config.js';
import { one, query } from './db.js';
import { newId } from './helpers.js';

/* The one place an email leaves the server.

   Sent through Resend's HTTPS API rather than SMTP: it needs no extra
   dependency, and many hosts (Render's free tier among them) block outbound
   SMTP ports. Without RESEND_API_KEY the email is only written to email_log
   as "logged" — the automations run end to end without mailing anybody.

   Every email carries a dedupe key, and the log has a unique index on it, so
   the same reminder can never go out twice even if two scheduler runs
   overlap: the second insert loses the race and sends nothing. */
export async function sendEmail({ userId = null, to, code, dedupeKey, subject, html, text }) {
  if (!to) return { status: 'skipped' };

  /* Claim the key first. If it is already taken this email has been sent —
     unless that attempt failed, in which case this one retries it. */
  const claimed = await one(
    `INSERT INTO email_log (id, user_id, code, dedupe_key, to_email, subject, status)
     VALUES ($1,$2,$3,$4,$5,$6,'logged')
     ON CONFLICT (dedupe_key) DO UPDATE
       SET status = 'logged', error = NULL, created_at = now(), to_email = EXCLUDED.to_email
       WHERE email_log.status = 'failed'
     RETURNING id`,
    [newId('em'), userId, code, dedupeKey, to, subject]
  );
  if (!claimed) return { status: 'duplicate' };

  if (!config.email.resendApiKey) {
    console.log(`[mail] ${code} -> ${to}: ${subject} (not sent: RESEND_API_KEY unset)`);
    return { status: 'logged' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.email.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.email.from,
        to: [to],
        subject,
        html,
        text,
        ...(config.email.replyTo ? { reply_to: config.email.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
    await query("UPDATE email_log SET status = 'sent' WHERE id = $1", [claimed.id]);
    return { status: 'sent' };
  } catch (err) {
    console.error(`[mail] ${code} -> ${to} failed:`, err.message);
    await query("UPDATE email_log SET status = 'failed', error = $2 WHERE id = $1", [
      claimed.id,
      err.message.slice(0, 500),
    ]);
    return { status: 'failed', error: err.message };
  }
}
