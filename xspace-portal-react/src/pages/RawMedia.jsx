import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import FileField from '../components/FileField';
import { timeAgo } from '../lib/time';
import { MEDIA_STATES } from '../lib/mediaStatus';
import './media.css';

/* Raw Media Inbox — everything anybody has uploaded.

   Studio, Founder and Core reach this; creators and realtors do not, and get
   their own uploads on the Media Upload screen instead. Nothing is filtered
   here because nothing needs to be: the server only hands these rows to roles
   entitled to all of them.

   This is where the editing round trip happens. Claim an item, edit it
   wherever you edit, then re-upload the finished cut — which sends it to
   Founder and Core for review rather than publishing it. Anything sent back
   with notes reappears at the top of this list. */

export default function RawMedia() {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  /* The item currently being handed back, and the cut being attached to it. */
  const [deliverFor, setDeliverFor] = useState(null);
  const [editedUrl, setEditedUrl] = useState('');
  const [deliverNote, setDeliverNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const out = await api.media.raw();
      setMedia(out.media || []);
    } catch (err) {
      setError(err.message || 'Could not load the inbox');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function claim(item) {
    setError('');
    setBusy(item.id);
    try {
      await api.media.setStatus(item.id, 'in_progress');
      await load();
    } catch (err) {
      setError(err.message || 'Could not claim that');
    } finally {
      setBusy(null);
    }
  }

  function openDeliver(item) {
    setDeliverFor(item);
    setEditedUrl('');
    setDeliverNote('');
    setError('');
  }

  async function deliver() {
    if (!editedUrl.trim()) return setError('Attach the edited cut first');
    setBusy(deliverFor.id);
    try {
      await api.media.deliver(deliverFor.id, editedUrl.trim(), deliverNote.trim() || null);
      setDeliverFor(null);
      await load();
    } catch (err) {
      setError(err.message || 'Could not send that for review');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page-media">
      <div className="media-head">
        <div>
          <h1>Raw Media Inbox</h1>
          <p className="small muted">
            Everything uploaded by creators and realtor partners. Claim it, edit it, then
            re-upload the cut for review.
          </p>
        </div>
      </div>

      {error && <div className="media-error">{error}</div>}

      <section className="panel">
        {loading ? (
          <div className="small muted media-empty">Loading…</div>
        ) : media.length === 0 ? (
          <div className="small muted media-empty">
            Nothing waiting. Uploads from creators and realtors land here.
          </div>
        ) : (
          <div className="media-rows">
            {media.map((m) => {
              const state = MEDIA_STATES[m.status] || {};
              const sentBack = m.status === 'changes_requested';
              return (
                <div className={`media-row${sentBack ? ' flagged' : ''}`} key={m.id}>
                  <div className="grow">
                    <strong>{m.title}</strong>
                    <div className="small muted">
                      {m.kind} · from {m.uploaded_by_name || 'unknown'}
                      {m.uploaded_by_role ? ` (${m.uploaded_by_role})` : ''} · {timeAgo(m.created_at)}
                      {m.claimed_by_name ? ` · claimed by ${m.claimed_by_name}` : ''}
                      {m.revision > 0 ? ` · v${m.revision}` : ''}
                    </div>

                    {m.note && <div className="small media-note">Note: {m.note}</div>}

                    {/* Why it came back. This is the whole reason the round
                        trip exists, so it is not tucked away. */}
                    {sentBack && m.review_notes && (
                      <div className="media-callout">
                        <strong>Changes requested{m.reviewed_by_name ? ` by ${m.reviewed_by_name}` : ''}:</strong>{' '}
                        {m.review_notes}
                      </div>
                    )}

                    {m.url && (
                      <a className="media-link" href={m.url} target="_blank" rel="noopener noreferrer">
                        Open the raw file ↗
                      </a>
                    )}
                  </div>

                  <div className="media-row-actions">
                    <span className={`media-badge ${state.tone || ''}`}>{state.label || m.status}</span>
                    {m.status === 'pending' && (
                      <button className="btn" disabled={busy === m.id} onClick={() => claim(m)}>
                        {busy === m.id ? 'Claiming…' : 'Start editing'}
                      </button>
                    )}
                    {(m.status === 'in_progress' || sentBack) && (
                      <button className="btn" onClick={() => openDeliver(m)}>
                        Upload edited cut
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {deliverFor && (
        <div
          className="modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && setDeliverFor(null)}
        >
          <div className="modal">
            <h3>Send the edited cut for review</h3>
            <div className="small muted">{deliverFor.title}</div>

            <FileField
              label="Edited file or link"
              value={editedUrl}
              onChange={setEditedUrl}
              accept="video/*,image/*"
              placeholder="Drive / YouTube link, or upload the cut"
              hint="The raw file is kept either way, so this can be redone if it comes back."
            />

            <label className="mf-field">
              <span>Note for Founder / Core</span>
              <textarea
                rows={3}
                value={deliverNote}
                onChange={(e) => setDeliverNote(e.target.value)}
                placeholder="What changed, what to look at"
              />
            </label>

            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setDeliverFor(null)}>Cancel</button>
              <button className="btn" disabled={busy === deliverFor.id} onClick={deliver}>
                {busy === deliverFor.id ? 'Sending…' : 'Send for review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
