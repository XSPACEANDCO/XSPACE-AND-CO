import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import './clientpage.css';

/* A client's own page, opened from a link in an Xspace email. No login: the
   token in the URL is the permission, and it opens only this client's page
   (server/src/routes/public.js).

     shortlist    their recommended projects, with "I'm interested"
     visit        how the site visit went
     feedback     rate the experience
     referral     introduce a friend
     unsubscribe  stop the emails

   An answer picked from a button in the email arrives as ?answer= or
   ?overall= and is pre-selected, but still needs a tap to send: email
   security scanners open links on their own, and must not answer for the
   client. */

const ANSWERS = [
  { key: 'interested', label: 'I liked it — what are the next steps?' },
  { key: 'not_sure', label: 'Not sure yet' },
  { key: 'not_interested', label: 'Show me other options' },
];

const ASPECTS = [
  ['communication', 'Communication'],
  ['recommendations', 'Property recommendations'],
  ['presentation', 'Presentation'],
  ['site_visit', 'Site visit'],
  ['overall', 'Overall experience'],
];

function Stars({ value, onChange, label }) {
  return (
    <div className="cp-stars" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} of 5`}
          className={'cp-star' + (value >= n ? ' on' : '')}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function Shortlist({ data, token }) {
  const [items, setItems] = useState(data.items);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  async function interested(item) {
    setBusy(item.id);
    setError('');
    try {
      await api.clientPage.respond(token, { itemId: item.id });
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, interested: true } : i)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h1>{data.name ? `${data.name}, your shortlist` : 'Your shortlist'}</h1>
      <p className="cp-lead">
        Projects our team has researched and verified for you. Tap “I’m interested” on any you
        would like to see — we will call you to arrange the site visit.
      </p>
      {error && <div className="cp-error">{error}</div>}
      {items.length === 0 && <p className="cp-muted">Nothing here yet.</p>}
      {items.map((item) => (
        <article className="cp-card" key={item.id}>
          {item.photos.length > 0 && (
            <div className="cp-photos">
              {item.photos.map((src) => (
                <img key={src} src={api.clientPage.photoUrl(src)} alt={item.title} loading="lazy" />
              ))}
            </div>
          )}
          <div className="cp-card-body">
            <h2>{item.title}</h2>
            {item.project && <div className="cp-muted">{item.project}</div>}
            <div className="cp-muted">{[item.location, item.type, item.configuration].filter(Boolean).join(' · ')}</div>

            <dl className="cp-facts">
              {[
                ['Price', item.price],
                ['Possession', item.possession],
                ['Builder', item.builder],
                ['Size', item.size],
                ['Facing', item.facing],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>

            {item.note && <p className="cp-why">Why we picked it: {item.note}</p>}
            {item.amenities.length > 0 && (
              <div className="cp-tags">
                {item.amenities.map((a) => <span key={a}>{a}</span>)}
              </div>
            )}
            {item.verification.length > 0 && (
              <div className="cp-verified">✓ {item.verification.join(' · ')}</div>
            )}
            {item.links.length > 0 && (
              <div className="cp-links">
                {item.links.map((l) => (
                  <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>
                ))}
              </div>
            )}

            {item.interested ? (
              <div className="cp-done">Thank you — we will be in touch to arrange your visit.</div>
            ) : (
              <button className="cp-btn" disabled={busy === item.id} onClick={() => interested(item)}>
                {busy === item.id ? 'Sending…' : 'I’m interested'}
              </button>
            )}
          </div>
        </article>
      ))}
    </>
  );
}

function VisitAnswer({ data, token, preset }) {
  const [answer, setAnswer] = useState(preset && ANSWERS.some((a) => a.key === preset) ? preset : '');
  const [done, setDone] = useState(Boolean(data.answer));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError('');
    try {
      await api.clientPage.respond(token, { answer });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        <h1>Thank you{data.name ? `, ${data.name}` : ''}</h1>
        <p className="cp-lead">We have your answer. Your Xspace contact will be in touch with the next step.</p>
      </>
    );
  }
  return (
    <>
      <h1>How was your visit{data.project ? ` to ${data.project}` : ''}?</h1>
      <p className="cp-lead">Your answer tells us how best to help you next.</p>
      {error && <div className="cp-error">{error}</div>}
      <div className="cp-choices">
        {ANSWERS.map((a) => (
          <label key={a.key} className={'cp-choice' + (answer === a.key ? ' on' : '')}>
            <input type="radio" name="answer" checked={answer === a.key} onChange={() => setAnswer(a.key)} />
            {a.label}
          </label>
        ))}
      </div>
      <button className="cp-btn" disabled={!answer || busy} onClick={send}>
        {busy ? 'Sending…' : 'Send'}
      </button>
    </>
  );
}

function Feedback({ data, token, preset }) {
  const initial = Number(preset) >= 1 && Number(preset) <= 5 ? Number(preset) : 0;
  const [r, setR] = useState({ overall: initial });
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(Boolean(data.submitted));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.clientPage.respond(token, { ...r, comment });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        <h1>Thank you{data.name ? `, ${data.name}` : ''}!</h1>
        <p className="cp-lead">Your feedback goes straight to the Xspace team.</p>
      </>
    );
  }
  return (
    <form onSubmit={send}>
      <h1>How did we do?</h1>
      <p className="cp-lead">Tap the stars — it takes under a minute.</p>
      {error && <div className="cp-error">{error}</div>}
      {ASPECTS.map(([key, label]) => (
        <div className="cp-rating" key={key}>
          <span>{label}</span>
          <Stars label={label} value={r[key] || 0} onChange={(n) => setR({ ...r, [key]: n })} />
        </div>
      ))}
      <label className="cp-field">
        <span>Anything else you would like to tell us? (optional)</span>
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
      </label>
      <button className="cp-btn" type="submit" disabled={!r.overall || busy}>
        {busy ? 'Sending…' : 'Send feedback'}
      </button>
    </form>
  );
}

function Referral({ data, token }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', note: '' });
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.clientPage.respond(token, f);
      setDone(true);
      setF({ name: '', phone: '', email: '', note: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send}>
      <h1>Introduce someone to Xspace</h1>
      <p className="cp-lead">
        {data.name ? `Thank you, ${data.name}. ` : ''}Tell us who might need help with a property —
        we will reach out and look after them the way we looked after you.
      </p>
      {done && <div className="cp-done">Thank you! We will be in touch with them. You can introduce someone else below.</div>}
      {error && <div className="cp-error">{error}</div>}
      <label className="cp-field">
        <span>Their name</span>
        <input value={f.name} onChange={set('name')} required maxLength={120} />
      </label>
      <label className="cp-field">
        <span>Phone</span>
        <input value={f.phone} onChange={set('phone')} inputMode="tel" maxLength={30} />
      </label>
      <label className="cp-field">
        <span>Email</span>
        <input type="email" value={f.email} onChange={set('email')} maxLength={200} />
      </label>
      <label className="cp-field">
        <span>What are they looking for? (optional)</span>
        <input value={f.note} onChange={set('note')} maxLength={1000} placeholder="e.g. a 3 BHK near Gachibowli" />
      </label>
      <button className="cp-btn" type="submit" disabled={busy || !f.name || (!f.phone && !f.email)}>
        {busy ? 'Sending…' : 'Send introduction'}
      </button>
    </form>
  );
}

function Unsubscribe({ data, token }) {
  const [done, setDone] = useState(Boolean(data.unsubscribed));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await api.clientPage.respond(token, {});
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return done ? (
    <>
      <h1>You are unsubscribed</h1>
      <p className="cp-lead">Xspace will not email you again. If you ever need us, just reply to any of our emails.</p>
    </>
  ) : (
    <>
      <h1>Stop emails from Xspace?</h1>
      <p className="cp-lead">You will no longer receive any emails from Xspace & Co.</p>
      {error && <div className="cp-error">{error}</div>}
      <button className="cp-btn" disabled={busy} onClick={confirm}>{busy ? 'Saving…' : 'Unsubscribe'}</button>
    </>
  );
}

export default function ClientPage() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.clientPage
      .get(token)
      .then(setData)
      .catch((err) => setError(err.message || 'This link could not be opened'));
  }, [token]);

  let body;
  if (error) body = <><h1>Link not available</h1><p className="cp-lead">{error}</p></>;
  else if (!data) body = <p className="cp-muted">Loading…</p>;
  else if (data.kind === 'shortlist') body = <Shortlist data={data} token={token} />;
  else if (data.kind === 'visit') body = <VisitAnswer data={data} token={token} preset={params.get('answer')} />;
  else if (data.kind === 'feedback') body = <Feedback data={data} token={token} preset={params.get('overall')} />;
  else if (data.kind === 'referral') body = <Referral data={data} token={token} />;
  else if (data.kind === 'unsubscribe') body = <Unsubscribe data={data} token={token} />;

  return (
    <div className="client-page">
      <header className="cp-brand">XSPACE &amp; CO.</header>
      <main className="cp-main">{body}</main>
      <footer className="cp-foot">Xspace &amp; Co. · Verified real estate, end to end.</footer>
    </div>
  );
}
