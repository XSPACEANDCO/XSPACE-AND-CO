import { config } from './config.js';
import { one, query } from './db.js';
import { newId } from './helpers.js';

/* The one place an email leaves the server.

   Sent over HTTPS rather than SMTP: it needs no extra dependency, and many
   hosts (Render's free tier among them) block outbound SMTP ports. Two
   providers (config.email.provider):

     brevo   BREVO_API_KEY — can send from one verified address, e.g. a Gmail
     resend  RESEND_API_KEY — needs a verified domain to mail anyone but the
             account owner

   With neither key the email is only written to email_log as "logged" — the
   automations run end to end without mailing anybody.

   Every email carries a dedupe key, and the log has a unique index on it, so
   the same reminder can never go out twice even if two scheduler runs
   overlap: the second insert loses the race and sends nothing. */

/* "Xspace & Co <hello@example.com>" -> { name, email }. A bare address works too. */
export function parseAddress(value) {
  const v = String(value || '').trim();
  const m = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/.exec(v);
  if (m) return { name: m[1].replace(/^"|"$/g, '').trim() || undefined, email: m[2] };
  return { email: v };
}

async function sendViaResend({ to, subject, html, text }) {
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
}

async function sendViaBrevo({ to, subject, html, text }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': config.email.brevoApiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: parseAddress(config.email.from),
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
      ...(config.email.replyTo ? { replyTo: parseAddress(config.email.replyTo) } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

const PROVIDERS = { brevo: sendViaBrevo, resend: sendViaResend };

export async function sendEmail({ userId = null, leadId = null, to, code, dedupeKey, subject, html, text }) {
  if (!to) return { status: 'skipped' };

  /* Claim the key first. If it is already taken this email has been sent —
     unless that attempt failed, in which case this one retries it. */
  const claimed = await one(
    `INSERT INTO email_log (id, user_id, lead_id, code, dedupe_key, to_email, subject, status)
     VALUES ($1,$2,$7,$3,$4,$5,$6,'logged')
     ON CONFLICT (dedupe_key) DO UPDATE
       SET status = 'logged', error = NULL, created_at = now(), to_email = EXCLUDED.to_email
       WHERE email_log.status = 'failed'
     RETURNING id`,
    [newId('em'), userId, code, dedupeKey, to, subject, leadId]
  );
  if (!claimed) return { status: 'duplicate' };

  const send = PROVIDERS[config.email.provider];
  if (!send) {
    console.log(`[mail] ${code} -> ${to}: ${subject} (not sent: no BREVO_API_KEY or RESEND_API_KEY)`);
    /* Locally, show what would have gone out — links included. */
    if (config.env !== 'production') console.log(text.replace(/^/gm, '[mail]   '));
    return { status: 'logged' };
  }

  try {
    await send({ to, subject, html, text });
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
